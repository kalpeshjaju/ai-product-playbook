/**
 * FILE PURPOSE: LLM client that routes all calls through the LiteLLM proxy
 *
 * WHY: Central gateway for cost tracking, observability (Langfuse), and fallbacks.
 *      Every app calls LiteLLM instead of providers directly.
 * HOW: OpenAI-compatible client pointing at the LiteLLM proxy URL.
 *
 * USAGE:
 *   import { createLLMClient } from '@playbook/shared-llm';
 *   const llm = createLLMClient();
 *   const res = await llm.chat.completions.create({ model: 'claude-haiku', ... });
 */
import OpenAI from 'openai';

export function createLLMClient(apiKey?: string): OpenAI {
  const baseURL = process.env.LITELLM_PROXY_URL || 'http://localhost:4000/v1';
  const key = apiKey || process.env.LITELLM_API_KEY || '';

  return new OpenAI({ baseURL, apiKey: key });
}

export type { OpenAI };
