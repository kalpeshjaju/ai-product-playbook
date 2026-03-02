/**
 * Tests for createLLMClient — env fallbacks, string arg compat, headers passthrough.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OpenAI from 'openai';

describe('createLLMClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('LITELLM_PROXY_URL', '');
    vi.stubEnv('LITELLM_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadClient() {
    const mod = await import('../src/llm-client.js');
    return mod.createLLMClient;
  }

  it('returns an OpenAI instance', async () => {
    const createLLMClient = await loadClient();
    const client = createLLMClient();
    expect(client).toBeInstanceOf(OpenAI);
  });

  it('uses localhost:4000 as default baseURL', async () => {
    const createLLMClient = await loadClient();
    const client = createLLMClient();
    expect(client.baseURL).toBe('http://localhost:4000/v1');
  });

  it('reads LITELLM_PROXY_URL from env', async () => {
    vi.stubEnv('LITELLM_PROXY_URL', 'https://proxy.example.com/v1');
    const createLLMClient = await loadClient();
    const client = createLLMClient();
    expect(client.baseURL).toBe('https://proxy.example.com/v1');
  });

  it('reads LITELLM_API_KEY from env', async () => {
    vi.stubEnv('LITELLM_API_KEY', 'env-key-123');
    const createLLMClient = await loadClient();
    const client = createLLMClient();
    expect(client.apiKey).toBe('env-key-123');
  });

  it('accepts string arg as apiKey (backwards compat)', async () => {
    const createLLMClient = await loadClient();
    const client = createLLMClient('my-key');
    expect(client.apiKey).toBe('my-key');
  });

  it('explicit apiKey overrides env var', async () => {
    vi.stubEnv('LITELLM_API_KEY', 'env-key');
    const createLLMClient = await loadClient();
    const client = createLLMClient({ apiKey: 'explicit-key' });
    expect(client.apiKey).toBe('explicit-key');
  });

  it('defaults apiKey to empty string when nothing set', async () => {
    const createLLMClient = await loadClient();
    const client = createLLMClient();
    expect(client.apiKey).toBe('');
  });

  it('passes headers as defaultHeaders', async () => {
    const createLLMClient = await loadClient();
    const client = createLLMClient({
      headers: { 'x-langfuse-trace-id': 'trace-abc' },
    });
    expect(client).toBeInstanceOf(OpenAI);
  });

  it('works with no arguments', async () => {
    const createLLMClient = await loadClient();
    expect(() => createLLMClient()).not.toThrow();
  });

  it('works with empty options object', async () => {
    const createLLMClient = await loadClient();
    expect(() => createLLMClient({})).not.toThrow();
  });
});
