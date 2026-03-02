/**
 * FILE PURPOSE: Production API server with health checks and graceful shutdown
 *
 * WHY: Central HTTP server for the AI Product Playbook API.
 * HOW: Native Node.js HTTP server — zero framework deps.
 *      Real health check with DB ping. CORS origin restriction.
 *      Graceful shutdown closing all connections.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import * as Sentry from '@sentry/node';
import { createServer, type IncomingMessage } from 'node:http';
import { createUserContext } from '@playbook/shared-llm';
import { checkTokenBudget, shutdownRedis, pingRedis } from './rate-limiter.js';
import { checkCostBudget } from './cost-guard.js';
import { verifyTurnstileToken } from './middleware/turnstile.js';
import { handlePromptRoutes } from './routes/prompts.js';
import { handleCostRoutes } from './routes/costs.js';
import { handleMoatRoutes } from './routes/moat.js';
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
import { handleEntryRoutes } from './routes/entries.js';
import { handleUserRoutes } from './routes/users.js';
import { handleIngestRoutes } from './routes/ingest.js';
import { authenticateRequest, verifyUserOwnership, validateAuthConfig } from './middleware/auth.js';
import { initPostHogServer, shutdownPostHog } from './middleware/posthog.js';
import { db } from './db/index.js';
import { closeDatabase } from './db/connection.js';
import { sql } from 'drizzle-orm';

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

// Validate auth configuration before accepting requests
validateAuthConfig();

const PORT = parseInt(process.env.PORT ?? '3002', 10);
const startTime = Date.now();

/** Parse allowed origins from env var (comma-separated). */
function getAllowedOrigins(): Set<string> | null {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return null;
  return new Set(raw.split(',').map((o) => o.trim()).filter(Boolean));
}

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

  // ─── CORS with origin restriction ───
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.headers.origin;

  if (allowedOrigins && requestOrigin) {
    if (allowedOrigins.has(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }
    // If origin is not in the allowed list, don't set the header (browser will block)
  } else if (process.env.NODE_ENV !== 'production') {
    // Dev/test: allow all origins when ALLOWED_ORIGINS not configured
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Production without ALLOWED_ORIGINS: no ACAO header → browser blocks cross-origin

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-turnstile-token, x-admin-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = req.url ?? '';

  // ─── Health check (before auth — used by load balancers and Docker HEALTHCHECK) ───
  if (url === '/api/health') {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    let dbStatus: 'ok' | 'unreachable' = 'unreachable';

    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = 'ok';
    } catch {
      // DB unreachable
    }

    // Redis health
    const redisStatus = await pingRedis();

    // LiteLLM proxy health
    let litellmStatus: 'ok' | 'unreachable' | 'not_configured' = 'not_configured';
    const litellmUrl = process.env.LITELLM_PROXY_URL;
    if (litellmUrl) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        // Strip /v1 suffix — LITELLM_PROXY_URL typically ends with /v1 for OpenAI compat,
        // but the health endpoint is at the root: /health, not /v1/health
        const baseUrl = litellmUrl.replace(/\/v1\/?$/, '');
        const healthHeaders: Record<string, string> = {};
        const litellmKey = process.env.LITELLM_API_KEY;
        if (litellmKey) healthHeaders['Authorization'] = `Bearer ${litellmKey}`;
        // Use /health/liveliness — lightweight check that the proxy is running.
        // /health tries to verify model connectivity and fails during startup race conditions.
        const litellmRes = await fetch(`${baseUrl}/health/liveliness`, { signal: controller.signal, headers: healthHeaders });
        clearTimeout(timer);
        litellmStatus = litellmRes.ok ? 'ok' : 'unreachable';
      } catch {
        litellmStatus = 'unreachable';
      }
    }

    // Overall status: degraded if any critical service is down
    const allOk = dbStatus === 'ok'
      && (redisStatus === 'ok' || !process.env.REDIS_URL)
      && (litellmStatus !== 'unreachable');
    const status = allOk ? 'ok' : 'degraded';
    const statusCode = dbStatus === 'ok' ? 200 : 503;

    res.statusCode = statusCode;
    res.end(JSON.stringify({
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      services: {
        database: dbStatus,
        redis: redisStatus,
        litellm: litellmStatus,
      },
    }));
    return;
  }

  // ─── Authentication (API key + Clerk JWT validation) ───
  const authResult = await authenticateRequest(req, res, url);
  if (!authResult) return; // 401/403 already sent

  // ─── IDOR prevention (user-scoped routes) ───
  // Skip IDOR check only when AUTH_MODE=open (no real identity to verify)
  if (authResult.tier === 'user' && authResult.authMethod !== 'none') {
    if (!verifyUserOwnership(url, authResult.userContext.userId)) {
      res.statusCode = 403;
      res.end(JSON.stringify({
        error: 'Forbidden: you can only access your own data',
      }));
      return;
    }
  }

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
  if (url.startsWith('/api/chat') || url.startsWith('/api/generate') || url.startsWith('/api/documents') || url.startsWith('/api/embeddings') || url.startsWith('/api/ingest')) {
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

  // ─── Moat health dashboard (§22) ───
  if (url.startsWith('/api/moat-health')) {
    await handleMoatRoutes(req, res, url);
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
    await handleGenerationRoutes(req, res, url, parseBody, authResult);
    return;
  }

  // ─── Feedback + Outcomes (§22) ───
  if (url.startsWith('/api/feedback')) {
    await handleFeedbackRoutes(req, res, url, parseBody, authResult);
    return;
  }

  // ─── Document ingestion (§19 INPUT pillar) ───
  if (url.startsWith('/api/documents')) {
    await handleDocumentRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Embedding search (§19) ───
  if (url.startsWith('/api/embeddings')) {
    await handleEmbeddingRoutes(req, res, url, parseBody, authResult);
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

  // ─── Playbook entries CRUD (DEC-006: Drizzle, not Strapi) ───
  if (url.startsWith('/api/entries')) {
    await handleEntryRoutes(req, res, url, parseBody);
    return;
  }

  // ─── Users from Clerk (DEC-006: Clerk, not Strapi) ───
  if (url.startsWith('/api/users')) {
    await handleUserRoutes(req, res, url);
    return;
  }

  // ─── Unified ingestion (§19 Input Pillar) ───
  if (url.startsWith('/api/ingest')) {
    await handleIngestRoutes(req, res, url);
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  // Railway expects stdout for health check logs
  process.stdout.write(`API server running on port ${PORT}\n`);
});

// ─── Graceful shutdown — close all connections in order ───
process.on('SIGTERM', async () => {
  process.stdout.write('SIGTERM received — shutting down gracefully\n');

  // 30s forced exit timeout
  const forceExitTimer = setTimeout(() => {
    process.stderr.write('WARN: Graceful shutdown timed out after 30s — forcing exit\n');
    process.exit(1);
  }, 30_000);
  forceExitTimer.unref();

  try {
    // 1. Stop accepting new connections
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    process.stdout.write('  Server closed\n');

    // 2. Flush analytics
    await shutdownPostHog();
    process.stdout.write('  PostHog flushed\n');

    // 3. Close Redis
    await shutdownRedis();
    process.stdout.write('  Redis disconnected\n');

    // 4. Close database
    await closeDatabase();
    process.stdout.write('  Database disconnected\n');

    process.stdout.write('Shutdown complete\n');
  } catch (err) {
    process.stderr.write(`ERROR during shutdown: ${err}\n`);
  }
});
