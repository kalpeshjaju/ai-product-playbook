/**
 * Tests for Composio client wrapper (composio/client.ts)
 *
 * Tests fail-open behavior (no API key → noop) and type contracts.
 *
 * NOTE: composio-core uses CJS require() at runtime, which vitest's vi.mock
 * cannot intercept in ESM context. Tests that need a real SDK client are
 * in apps/api/tests/ where the module boundary can be mocked.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('Composio client (fail-open behavior)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('getAvailableActions returns empty array when API key not set', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', '');
    const { getAvailableActions } = await import('../src/composio/client.js');

    const actions = await getAvailableActions();
    expect(actions).toEqual([]);
  });

  it('getAvailableActions returns empty array when API key is undefined', async () => {
    delete process.env.COMPOSIO_API_KEY;
    const { getAvailableActions } = await import('../src/composio/client.js');

    const actions = await getAvailableActions();
    expect(actions).toEqual([]);
  });

  it('executeAction returns noop result when API key not set', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', '');
    const { executeAction } = await import('../src/composio/client.js');

    const result = await executeAction('SLACK_SEND_MESSAGE', { text: 'Hello' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
    expect(result.metadata.noop).toBe(true);
    expect(result.metadata.actionName).toBe('SLACK_SEND_MESSAGE');
    expect(result.metadata.executionTimeMs).toBeTypeOf('number');
  });

  it('executeAction returns noop result with entity id when API key not set', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', '');
    const { executeAction } = await import('../src/composio/client.js');

    const result = await executeAction('ANY_ACTION', { param: 'value' }, 'entity-1');
    expect(result.success).toBe(true);
    expect(result.metadata.noop).toBe(true);
  });

  it('createComposioClient is idempotent when API key not set', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', '');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { createComposioClient } = await import('../src/composio/client.js');

    createComposioClient();
    createComposioClient();
    createComposioClient();

    // Only logs the "disabled" message once (idempotent)
    const disabledCalls = stderrSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('disabled'),
    );
    expect(disabledCalls.length).toBe(1);
    stderrSpy.mockRestore();
  });
});

describe('Composio types', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('getAvailableActions returns an array', async () => {
    const { getAvailableActions } = await import('../src/composio/client.js');

    const actions = await getAvailableActions('slack');
    expect(Array.isArray(actions)).toBe(true);
  });

  it('executeAction result has correct shape', async () => {
    const { executeAction } = await import('../src/composio/client.js');

    const result = await executeAction('TEST', {});
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata).toHaveProperty('actionName');
    expect(result.metadata).toHaveProperty('executionTimeMs');
    expect(result.metadata).toHaveProperty('noop');
  });
});
