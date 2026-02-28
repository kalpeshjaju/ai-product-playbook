/**
 * FILE PURPOSE: Extract unified user identity from HTTP requests
 *
 * WHY: Consolidates the ad-hoc getUserId() pattern from server.ts into
 *      a reusable utility that works with any HTTP-like request object.
 *      Also generates LiteLLM headers for Langfuse identity forwarding.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { UserContext, LangfuseHeaders } from './types.js';

/** Minimal request interface — works with Node http, Express, or any object with headers. */
export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/**
 * Extract user identity from an HTTP request.
 *
 * Priority: x-api-key header → Bearer JWT `sub` claim → IP address fallback.
 * JWT parsing is best-effort (base64 decode only, no signature verification —
 * signature should be verified upstream by auth middleware).
 */
export function createUserContext(req: RequestLike): UserContext {
  // 1. API key
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    return { userId: apiKey, source: 'api_key' };
  }

  // 2. Bearer JWT — extract `sub` and `email` claims
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const payload = decodeJwtPayload(token);
    if (typeof payload?.sub === 'string') {
      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        source: 'jwt',
      };
    }
  }

  // 3. IP address fallback
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0]!.trim()
    : req.socket?.remoteAddress ?? 'unknown';

  return { userId: ip, source: 'ip' };
}

/**
 * Create a UserContext from explicit values (for non-HTTP contexts like workers, CLI).
 */
export function createUserContextFromValues(
  userId: string,
  source: UserContext['source'] = 'api_key',
  extra?: Partial<Pick<UserContext, 'sessionId' | 'email' | 'traits'>>,
): UserContext {
  return { userId, source, ...extra };
}

/**
 * Generate LiteLLM headers that forward user identity to Langfuse.
 *
 * LiteLLM reads these headers and passes them as Langfuse trace metadata,
 * linking LLM calls to specific users without additional Langfuse SDK calls.
 */
export function withLangfuseHeaders(user: UserContext): LangfuseHeaders {
  const headers: LangfuseHeaders = {
    'x-litellm-user': user.userId,
  };

  if (user.sessionId) {
    headers['x-litellm-session-id'] = user.sessionId;
  }

  const metadata: Record<string, string> = {};
  if (user.email) metadata.email = user.email;
  if (user.source) metadata.source = user.source;
  if (user.traits) Object.assign(metadata, user.traits);

  if (Object.keys(metadata).length > 0) {
    headers['x-litellm-metadata'] = JSON.stringify(metadata);
  }

  return headers;
}

/** Best-effort JWT payload decode (no signature verification). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1]!, 'base64url').toString('utf-8');
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}
