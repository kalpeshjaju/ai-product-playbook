/**
 * FILE PURPOSE: API key authentication and authorization middleware
 *
 * WHY: Security review identified all API routes are publicly accessible.
 *      This middleware enforces three-tier auth before route dispatch:
 *      PUBLIC (no auth), USER (x-api-key), ADMIN (x-api-key + x-admin-key).
 * HOW: Validates x-api-key against API_KEYS env var (comma-separated).
 *      IDOR prevention matches URL userId to authenticated userId.
 *      Fail-open when API_KEYS is not set (backward-compatible dev/test).
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createUserContext, type UserContext } from '@playbook/shared-llm';

export type AuthTier = 'public' | 'user' | 'admin';

export interface AuthResult {
  userContext: UserContext;
  tier: AuthTier;
}

// ─── Route tier classification (data-driven) ───

interface RouteRule {
  prefix: string;
  methods?: string[];
  tier: AuthTier;
}

/**
 * Rules are evaluated top-to-bottom, first match wins.
 * More specific prefixes must come before broader ones.
 */
const ROUTE_RULES: RouteRule[] = [
  // PUBLIC — no auth required
  { prefix: '/api/health', tier: 'public' },
  { prefix: '/api/entries', tier: 'public' },
  { prefix: '/api/users', tier: 'public' },

  // ADMIN — mutations that affect global state or execute external actions
  { prefix: '/api/costs/reset', methods: ['POST'], tier: 'admin' },
  { prefix: '/api/composio/execute', methods: ['POST'], tier: 'admin' },
  { prefix: '/api/openpipe/finetune', methods: ['POST'], tier: 'admin' },
  { prefix: '/api/documents/upload', methods: ['POST'], tier: 'admin' },
  { prefix: '/api/documents', methods: ['POST'], tier: 'admin' },
  { prefix: '/api/few-shot/build', methods: ['POST'], tier: 'admin' },
  { prefix: '/api/few-shot', methods: ['POST'], tier: 'admin' },
  { prefix: '/api/few-shot', methods: ['DELETE'], tier: 'admin' },
  { prefix: '/api/prompts', methods: ['POST'], tier: 'admin' },
  { prefix: '/api/prompts', methods: ['PATCH'], tier: 'admin' },
];

/** Determine the required auth tier for a given URL + method. */
export function getRequiredTier(url: string, method: string): AuthTier {
  // Strip query string for prefix matching
  const path = url.split('?')[0] ?? url;

  for (const rule of ROUTE_RULES) {
    if (path.startsWith(rule.prefix)) {
      if (!rule.methods || rule.methods.includes(method)) {
        return rule.tier;
      }
    }
  }

  // Default: any /api/* route requires user-level auth
  if (path.startsWith('/api/')) return 'user';
  return 'public';
}

// ─── API key validation ───

let cachedApiKeys: Set<string> | null = null;

function getValidApiKeys(): Set<string> {
  if (cachedApiKeys) return cachedApiKeys;
  const raw = process.env.API_KEYS ?? '';
  cachedApiKeys = new Set(
    raw.split(',').map((k) => k.trim()).filter(Boolean),
  );
  return cachedApiKeys;
}

/** For testing: clear the cached API keys so env changes take effect. */
export function clearApiKeyCache(): void {
  cachedApiKeys = null;
}

function isValidApiKey(key: string): boolean {
  const keys = getValidApiKeys();
  // Fail-open: no API_KEYS configured = skip validation (dev/test backward compat)
  if (keys.size === 0) return true;
  return keys.has(key);
}

function isValidAdminKey(req: IncomingMessage): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers['x-admin-key'];
  if (!adminKey) return false;
  return typeof provided === 'string' && provided === adminKey;
}

/**
 * Authenticate the request. Returns AuthResult on success, null on failure
 * (401/403 response already sent).
 */
export function authenticateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
): AuthResult | null {
  const method = req.method ?? 'GET';
  const tier = getRequiredTier(url, method);

  // Public routes pass through
  if (tier === 'public') {
    const userContext = createUserContext(req);
    return { userContext, tier };
  }

  // User + Admin routes require valid x-api-key
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    res.statusCode = 401;
    res.end(JSON.stringify({
      error: 'Authentication required: x-api-key header missing',
    }));
    return null;
  }

  if (!isValidApiKey(apiKey)) {
    res.statusCode = 401;
    res.end(JSON.stringify({
      error: 'Authentication failed: invalid API key',
    }));
    return null;
  }

  const userContext = createUserContext(req);

  // Admin routes additionally require valid x-admin-key
  if (tier === 'admin') {
    if (!isValidAdminKey(req)) {
      res.statusCode = 403;
      res.end(JSON.stringify({
        error: 'Forbidden: admin access required (x-admin-key)',
      }));
      return null;
    }
  }

  return { userContext, tier };
}

// ─── IDOR prevention ───

/** URL path patterns where :userId is a path segment. */
const USER_PATH_PATTERNS = [
  /^\/api\/preferences\/([^/]+)/,
  /^\/api\/memory\/([^/]+)$/,
];

/** Segments that look like userId path params but are actually route names. */
const SKIP_SEGMENTS = new Set(['search']);

/**
 * Verify the authenticated user owns the resource being accessed.
 * Returns true if ownership is valid or not applicable.
 * Skips IDOR check when API_KEYS is not configured (fail-open mode).
 */
export function verifyUserOwnership(
  url: string,
  authenticatedUserId: string,
): boolean {
  // Skip IDOR in fail-open mode (no API_KEYS configured)
  const keys = getValidApiKeys();
  if (keys.size === 0) return true;

  const parsedUrl = new URL(url, 'http://localhost');

  // Check query param userId (used by generations, memory/search)
  const queryUserId = parsedUrl.searchParams.get('userId');
  if (queryUserId && queryUserId !== authenticatedUserId) {
    return false;
  }

  // Check URL path patterns
  for (const pattern of USER_PATH_PATTERNS) {
    const match = parsedUrl.pathname.match(pattern);
    if (match) {
      const pathUserId = decodeURIComponent(match[1]!);
      if (SKIP_SEGMENTS.has(pathUserId)) continue;
      if (pathUserId !== authenticatedUserId) {
        return false;
      }
    }
  }

  return true;
}
