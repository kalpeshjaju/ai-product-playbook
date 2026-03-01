/**
 * FILE PURPOSE: Token-based rate limiter using Redis sliding window
 *
 * WHY: Request-based limits don't prevent denial-of-wallet.
 *      A user sending 10 "write a 10,000 word essay" requests
 *      costs more than 10,000 "what time is it?" requests.
 *      (Playbook §18 — Token-Based Rate Limiting, lines 3946-3978)
 *
 * HOW: Track tokens consumed per user per 24h window. Block when budget exceeded.
 *      Uses ioredis for Railway Redis (not Upstash).
 *      Production: fail-CLOSED when Redis unavailable (security-first).
 *      Development: fail-open for local dev without Redis.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import { Redis } from 'ioredis';

const DAILY_TOKEN_BUDGET = 100_000; // §18 line 3962: 100K tokens/user/day
const WINDOW_SECONDS = 86_400;      // 24 hours
const KEY_PREFIX = 'ratelimit:tokens:';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
      if (times > 3) return null; // Stop retrying after 3 attempts
      return Math.min(times * 200, 1000);
    },
    lazyConnect: true,
  });

  redis.on('error', () => {
    // Swallow connection errors — fail-open handled in checkTokenBudget
  });

  return redis;
}

export interface TokenBudgetResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Check if user has remaining token budget for this request.
 * Increments the counter by estimatedTokens if allowed.
 *
 * Fail-open: returns allowed=true when Redis is unavailable.
 */
export async function checkTokenBudget(
  userId: string,
  estimatedTokens: number,
): Promise<TokenBudgetResult> {
  const client = getRedis();

  // Production: fail-closed when Redis unavailable (deny-of-wallet protection)
  // Development: fail-open for local dev without Redis
  if (!client) {
    if (IS_PRODUCTION) {
      process.stderr.write('WARN: Redis unavailable in production — blocking request (fail-closed)\n');
      return { allowed: false, remaining: 0, limit: DAILY_TOKEN_BUDGET };
    }
    return { allowed: true, remaining: DAILY_TOKEN_BUDGET, limit: DAILY_TOKEN_BUDGET };
  }

  const key = `${KEY_PREFIX}${userId}`;

  try {
    const current = await client.get(key);
    const used = current ? parseInt(current, 10) : 0;
    const remaining = DAILY_TOKEN_BUDGET - used;

    if (estimatedTokens > remaining) {
      return { allowed: false, remaining: Math.max(0, remaining), limit: DAILY_TOKEN_BUDGET };
    }

    // Atomically increment and set TTL
    const pipeline = client.pipeline();
    pipeline.incrby(key, estimatedTokens);
    pipeline.expire(key, WINDOW_SECONDS);
    await pipeline.exec();

    return {
      allowed: true,
      remaining: Math.max(0, remaining - estimatedTokens),
      limit: DAILY_TOKEN_BUDGET,
    };
  } catch {
    // Production: fail-closed on Redis errors (deny-of-wallet protection)
    // Development: fail-open so devs aren't blocked by Redis issues
    if (IS_PRODUCTION) {
      process.stderr.write('WARN: Redis error in production — blocking request (fail-closed)\n');
      return { allowed: false, remaining: 0, limit: DAILY_TOKEN_BUDGET };
    }
    return { allowed: true, remaining: DAILY_TOKEN_BUDGET, limit: DAILY_TOKEN_BUDGET };
  }
}

/** Disconnect Redis gracefully. Call during server shutdown. */
export async function shutdownRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      process.stderr.write('WARN: Error closing Redis connection\n');
    }
    redis = null;
  }
}
