/**
 * FILE PURPOSE: API authentication — API key + Clerk JWT verification
 *
 * WHY: Supports two auth methods:
 *      1. API key (x-api-key header) — for service-to-service and CLI
 *      2. Clerk JWT (Authorization: Bearer) — for browser sessions via web/admin
 *      Three-tier model: PUBLIC (no auth), USER (api-key or JWT), ADMIN (+ x-admin-key).
 * HOW: Checks Authorization Bearer first (Clerk JWT), falls back to x-api-key.
 *      Clerk is optional — if CLERK_SECRET_KEY is not set, JWT verification is skipped.
 *      Fail-open when neither API_KEYS nor CLERK_SECRET_KEY is configured (dev mode).
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
  authMethod: 'clerk' | 'api-key' | 'none';
  clerkUserId?: string;
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
  { prefix: '/api/entries', methods: ['GET'], tier: 'public' },
  { prefix: '/api/entries', methods: ['POST', 'PATCH', 'DELETE'], tier: 'admin' },
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

// ─── Clerk JWT verification ───

interface ClerkJwtPayload {
  sub: string;
  iss: string;
  exp: number;
  iat: number;
  azp?: string;
  org_id?: string;
  org_role?: string;
}

/**
 * Verify a Clerk JWT from the Authorization: Bearer header.
 * Returns the decoded payload if valid, null if invalid or not configured.
 * Uses @clerk/backend for proper JWKS-based verification.
 */
async function verifyClerkJwt(token: string): Promise<ClerkJwtPayload | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  try {
    const { verifyToken } = await import('@clerk/backend');
    const payload = await verifyToken(token, { secretKey });

    return {
      sub: payload.sub,
      iss: payload.iss ?? '',
      exp: payload.exp,
      iat: payload.iat ?? 0,
      azp: payload.azp as string | undefined,
      org_id: payload.org_id as string | undefined,
      org_role: payload.org_role as string | undefined,
    };
  } catch {
    return null;
  }
}

/** Extract Bearer token from Authorization header. */
function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1] ?? null;
}

// ─── Main authentication function ───

/** Check if we're in fail-open mode (no auth configured). */
function isFailOpenMode(): boolean {
  const keys = getValidApiKeys();
  const hasClerk = Boolean(process.env.CLERK_SECRET_KEY);
  return keys.size === 0 && !hasClerk;
}

/**
 * Authenticate the request. Returns AuthResult on success, null on failure
 * (401/403 response already sent).
 *
 * Auth priority:
 * 1. Clerk JWT (Authorization: Bearer) — browser sessions
 * 2. API key (x-api-key header) — service-to-service
 * 3. Fail-open (no auth configured) — dev/test only
 */
export async function authenticateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
): Promise<AuthResult | null> {
  const method = req.method ?? 'GET';
  const tier = getRequiredTier(url, method);

  // Public routes pass through
  if (tier === 'public') {
    const userContext = createUserContext(req);
    return { userContext, tier, authMethod: 'none' };
  }

  // Try Clerk JWT first
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const payload = await verifyClerkJwt(bearerToken);
    if (payload) {
      const userContext = createUserContext(req);
      // Override userId with Clerk's verified sub claim
      userContext.userId = payload.sub;

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

      return { userContext, tier, authMethod: 'clerk', clerkUserId: payload.sub };
    }
    // Bearer token present but invalid — reject (don't fall back)
    if (process.env.CLERK_SECRET_KEY) {
      res.statusCode = 401;
      res.end(JSON.stringify({
        error: 'Authentication failed: invalid or expired session token',
      }));
      return null;
    }
  }

  // Try API key
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
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

    return { userContext, tier, authMethod: 'api-key' };
  }

  // Fail-open: no API_KEYS and no CLERK_SECRET_KEY configured
  if (isFailOpenMode()) {
    const userContext = createUserContext(req);
    return { userContext, tier, authMethod: 'none' };
  }

  // No valid auth provided
  res.statusCode = 401;
  res.end(JSON.stringify({
    error: 'Authentication required: provide Authorization Bearer token or x-api-key header',
  }));
  return null;
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
 * Skips IDOR check in fail-open mode.
 */
export function verifyUserOwnership(
  url: string,
  authenticatedUserId: string,
): boolean {
  // Skip IDOR in fail-open mode
  if (isFailOpenMode()) return true;

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
