/**
 * FILE PURPOSE: Type definitions for unified identity tracking
 *
 * WHY: userId is extracted ad-hoc in server.ts, PostHog never calls .identify(),
 *      and Langfuse doesn't receive user metadata. These types unify identity
 *      across all systems (API, PostHog, Langfuse via LiteLLM headers).
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

/** Unified user context extracted from an incoming request. */
export interface UserContext {
  /** Primary user identifier (API key, JWT sub, or IP fallback). */
  userId: string;
  /** Session identifier, if available. */
  sessionId?: string;
  /** User email, if extractable from JWT or headers. */
  email?: string;
  /** Arbitrary traits for analytics enrichment. */
  traits?: Record<string, string>;
  /** How the userId was resolved. */
  source: 'api_key' | 'jwt' | 'ip';
}

/**
 * Headers that LiteLLM forwards to Langfuse for identity tracking.
 * See: https://docs.litellm.ai/docs/proxy/user_keys
 */
export interface LangfuseHeaders {
  'x-litellm-user': string;
  'x-litellm-session-id'?: string;
  'x-litellm-metadata'?: string;
}
