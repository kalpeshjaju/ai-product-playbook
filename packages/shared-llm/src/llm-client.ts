/**
 * FILE PURPOSE: LLM client that routes all calls through the LiteLLM proxy
 *
 * WHY: Central gateway for cost tracking, observability (Langfuse), and fallbacks.
 *      Every app calls LiteLLM instead of providers directly.
 * HOW: OpenAI-compatible client pointing at the LiteLLM proxy URL.
 *
 * rateLimited: server-level — checkTokenBudget + checkCostBudget applied in apps/api/src/server.ts
 *
 * USAGE:
 *   import { createLLMClient } from '@playbook/shared-llm';
 *   const llm = createLLMClient();
 *   const res = await llm.chat.completions.create({ model: 'claude-haiku', ... });
 */
import OpenAI from 'openai';

export interface LLMClientOptions {
  apiKey?: string;
  /** Extra default headers — used for Langfuse trace forwarding. */
  headers?: Record<string, string>;
}

export function createLLMClient(options?: string | LLMClientOptions): OpenAI {
  // Backwards-compatible: accept raw apiKey string
  const opts: LLMClientOptions = typeof options === 'string'
    ? { apiKey: options }
    : options ?? {};

  const baseURL = process.env.LITELLM_PROXY_URL || 'http://localhost:4000/v1';
  const key = opts.apiKey || process.env.LITELLM_API_KEY || '';

  return new OpenAI({
    baseURL,
    apiKey: key,
    ...(opts.headers ? { defaultHeaders: opts.headers } : {}),
  });
}

export type { OpenAI };
