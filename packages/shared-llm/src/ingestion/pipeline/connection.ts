/**
 * FILE PURPOSE: Shared Redis connection parsing for BullMQ queue + workers
 * WHY: DRY — queue.ts and workers.ts used identical URL → connection logic.
 */

export interface RedisConnectionOptions {
  host: string;
  port: number;
  password: string | undefined;
  tls: Record<string, never> | undefined;
}

export function parseRedisConnection(redisUrl?: string): RedisConnectionOptions {
  const url = redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}
