/**
 * FILE PURPOSE: Minimal API server for infrastructure verification
 *
 * WHY: Proves Railway deploy pipeline works end-to-end.
 * HOW: Native Node.js HTTP server — zero framework deps.
 *      Returns mock data using shared types.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import * as Sentry from '@sentry/node';
import { createServer, type IncomingMessage } from 'node:http';
import type { PlaybookEntry, AdminUser } from '@playbook/shared-types';
import { createUserContext } from '@playbook/shared-llm';
import { checkTokenBudget } from './rate-limiter.js';
import { checkCostBudget } from './cost-guard.js';
import { verifyTurnstileToken } from './middleware/turnstile.js';
import { handlePromptRoutes } from './routes/prompts.js';
import { handleCostRoutes } from './routes/costs.js';
import { handleMemoryRoutes } from './routes/memory.js';
import { handleComposioRoutes } from './routes/composio.js';
import { handleOpenPipeRoutes } from './routes/openpipe.js';
import { handleGenerationRoutes } from './routes/generations.js';
import { handleFeedbackRoutes } from './routes/feedback.js';
import { handleDocumentRoutes } from './routes/documents.js';
import { handleEmbeddingRoutes } from './routes/embeddings.js';
import { handlePreferenceRoutes } from './routes/preferences.js';
import { handleTranscriptionRoutes } from './routes/transcription.js';
import { handleFewShotRoutes } from './routes/few-shot.js';
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

    // ─── Cost budget guard (§18) ───
    const costCheck = checkCostBudget();
    if (!costCheck.allowed) {
      res.statusCode = 429;
      res.end(JSON.stringify({
        error: 'Cost budget exceeded',
        report: costCheck.report,
      }));
      return;
    }
  }

  // ─── Cost observability routes ───
  if (url.startsWith('/api/costs')) {
    handleCostRoutes(req, res, url);
    return;
  }

  // ─── Prompt versioning routes (§20) ───
  if (url.startsWith('/api/prompts')) {
    await handlePromptRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Tier 2: Memory routes ───
  if (url.startsWith('/api/memory')) {
    await handleMemoryRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Tier 2: Composio routes ───
  if (url.startsWith('/api/composio')) {
    await handleComposioRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Tier 2: OpenPipe routes ───
  if (url.startsWith('/api/openpipe')) {
    await handleOpenPipeRoutes(req, res, url, parseBody);
    return;
  }

  // ─── AI Generation logging (§21 Plane 3) ───
  if (url.startsWith('/api/generations')) {
    await handleGenerationRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Feedback + Outcomes (§22) ───
  if (url.startsWith('/api/feedback')) {
    await handleFeedbackRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Document ingestion (§19 INPUT pillar) ───
  if (url.startsWith('/api/documents')) {
    await handleDocumentRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Embedding search (§19) ───
  if (url.startsWith('/api/embeddings')) {
    await handleEmbeddingRoutes(req, res, url, parseBody);
    return;
  }

  // ─── User preferences (§20 Personalization) ───
  if (url.startsWith('/api/preferences')) {
    await handlePreferenceRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Voice transcription (§19 INPUT) ───
  if (url.startsWith('/api/transcribe')) {
    await handleTranscriptionRoutes(req, res, url);
    return;
  }

  // ─── Few-shot bank (§20 STRATEGY) ───
  if (url.startsWith('/api/few-shot')) {
    await handleFewShotRoutes(req, res, url, parseBody);
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
