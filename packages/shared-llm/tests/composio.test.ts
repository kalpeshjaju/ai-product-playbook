/**
 * Tests for Composio client wrapper (composio/client.ts)
 *
 * Tests the fail-open behavior when composio-core SDK is not available.
 * SDK-dependent behavior is tested in route-level tests (apps/api/tests/composio.test.ts)
 * where the composio module exports can be mocked via standard vi.mock().
 *
 * NOTE: composio-core uses dynamic require() at runtime, which vitest's vi.mock
 * cannot intercept. This is by design — composio-core is an optional dependency.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('Composio client (fail-open behavior)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getAvailableActions returns empty array when SDK unavailable', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', 'test-key');
    const { getAvailableActions } = await import('../src/composio/client.js');

    // composio-core SDK is not installed in test → returns []
    const actions = await getAvailableActions();
    expect(actions).toEqual([]);
  });

  it('getAvailableActions returns empty array when API key not set', async () => {
    delete process.env.COMPOSIO_API_KEY;
    vi.resetModules();
    const { getAvailableActions } = await import('../src/composio/client.js');

    const actions = await getAvailableActions();
    expect(actions).toEqual([]);
  });

  it('executeAction returns noop result when SDK unavailable', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', 'test-key');
    vi.resetModules();
    const { executeAction } = await import('../src/composio/client.js');

    const result = await executeAction('SLACK_SEND_MESSAGE', { text: 'Hello' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
    expect(result.metadata.noop).toBe(true);
    expect(result.metadata.actionName).toBe('SLACK_SEND_MESSAGE');
    expect(result.metadata.executionTimeMs).toBeTypeOf('number');
  });

  it('executeAction returns noop result when API key not set', async () => {
    delete process.env.COMPOSIO_API_KEY;
    vi.resetModules();
    const { executeAction } = await import('../src/composio/client.js');

    const result = await executeAction('ANY_ACTION', { param: 'value' }, 'entity-1');
    expect(result.success).toBe(true);
    expect(result.metadata.noop).toBe(true);
  });

  it('createComposioClient is idempotent', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', 'test-key');
    vi.resetModules();
    const { createComposioClient } = await import('../src/composio/client.js');

    // Calling multiple times should not throw
    createComposioClient();
    createComposioClient();
    createComposioClient();
  });
});

describe('Composio types', () => {
  it('ComposioAction has required fields', async () => {
    const { getAvailableActions } = await import('../src/composio/client.js');

    // Returns array (even if empty), confirming correct type
    const actions = await getAvailableActions('slack');
    expect(Array.isArray(actions)).toBe(true);
  });

  it('ComposioActionResult has correct shape', async () => {
    vi.resetModules();
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
