/**
 * FILE PURPOSE: Minimal API server for infrastructure verification
 *
 * WHY: Proves Railway deploy pipeline works end-to-end.
 * HOW: Native Node.js HTTP server — zero framework deps.
 *      Returns mock data using shared types.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import * as Sentry from '@sentry/node';
import { createServer, type IncomingMessage } from 'node:http';
import type { PlaybookEntry, AdminUser } from '@playbook/shared-types';
import { createUserContext } from '@playbook/shared-llm';
import { checkTokenBudget } from './rate-limiter.js';
import { verifyTurnstileToken } from './middleware/turnstile.js';
import { handlePromptRoutes } from './routes/prompts.js';
import { initPostHogServer, shutdownPostHog } from './middleware/posthog.js';

// Sentry — no-op when DSN not set
const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });
}

// PostHog server-side — no-op when POSTHOG_SERVER_API_KEY not set
initPostHogServer();

const PORT = parseInt(process.env.PORT ?? '3002', 10);

const entries: PlaybookEntry[] = [
  { id: '1', title: 'JSON Extraction', summary: 'Multi-strategy repair', category: 'resilience', status: 'active' },
  { id: '2', title: 'Cost Ledger', summary: 'Budget enforcement', category: 'cost', status: 'active' },
];

const users: AdminUser[] = [
  { id: 'u1', name: 'Kalpesh Jaju', email: 'kalpesh@example.com', role: 'owner' },
];

/** Parse JSON body from incoming request. */
function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/** Extract user identifier for rate limiting — delegates to shared identity module. */
function getUserId(req: IncomingMessage): string {
  const ctx = createUserContext(req);
  return ctx.userId;
}

const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-turnstile-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = req.url ?? '';

  // ─── Turnstile bot protection on /api/chat* routes (§18 Denial-of-Wallet) ───
  if (url.startsWith('/api/chat')) {
    const token = req.headers['x-turnstile-token'];
    const ip = getUserId(req);
    const valid = await verifyTurnstileToken(
      typeof token === 'string' ? token : '',
      ip,
    );
    if (!valid) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Bot verification failed' }));
      return;
    }
  }

  // ─── Token-based rate limiting on LLM routes (§18) ───
  if (url.startsWith('/api/chat') || url.startsWith('/api/generate')) {
    const userId = getUserId(req);
    const budget = await checkTokenBudget(userId, 500); // estimate 500 tokens per request
    if (!budget.allowed) {
      res.statusCode = 429;
      res.end(JSON.stringify({
        error: 'Token budget exceeded',
        daily_limit: budget.limit,
        remaining: budget.remaining,
      }));
      return;
    }
  }

  // ─── Prompt versioning routes (§20) ───
  if (url.startsWith('/api/prompts')) {
    await handlePromptRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Existing routes ───
  if (url === '/api/health') {
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else if (url === '/api/entries') {
    res.end(JSON.stringify(entries));
  } else if (url === '/api/users') {
    res.end(JSON.stringify(users));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  // Railway expects stdout for health check logs
  process.stdout.write(`API server running on port ${PORT}\n`);
});

// Graceful shutdown — flush PostHog events
process.on('SIGTERM', async () => {
  await shutdownPostHog();
  server.close();
});
