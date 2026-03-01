/**
 * Tests for OpenPipe client wrapper (openpipe/client.ts)
 *
 * Tests the fail-open behavior when openpipe SDK is not available.
 * SDK-dependent behavior is tested in route-level tests (apps/api/tests/openpipe.test.ts)
 * where the openpipe module exports can be mocked via standard vi.mock().
 *
 * NOTE: openpipe uses dynamic require() at runtime, which vitest's vi.mock
 * cannot intercept. This is by design — openpipe is an optional dependency.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('OpenPipe client (fail-open behavior)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logTrainingData is no-op when SDK unavailable', async () => {
    vi.stubEnv('OPENPIPE_API_KEY', 'test-key');
    const { logTrainingData } = await import('../src/openpipe/client.js');

    // openpipe SDK is not installed in test → silent no-op
    await expect(logTrainingData({
      messages: [{ role: 'user', content: 'Test' }],
    })).resolves.toBeUndefined();
  });

  it('logTrainingData is no-op when API key not set', async () => {
    delete process.env.OPENPIPE_API_KEY;
    vi.resetModules();
    const { logTrainingData } = await import('../src/openpipe/client.js');

    await expect(logTrainingData({
      messages: [{ role: 'user', content: 'Test' }],
      idealOutput: 'Expected',
      tags: { taskType: 'greeting' },
    })).resolves.toBeUndefined();
  });

  it('triggerFineTune returns null when SDK unavailable', async () => {
    vi.stubEnv('OPENPIPE_API_KEY', 'test-key');
    vi.resetModules();
    const { triggerFineTune } = await import('../src/openpipe/client.js');

    const jobId = await triggerFineTune({ baseModel: 'gpt-4o-mini' });
    expect(jobId).toBeNull();
  });

  it('triggerFineTune returns null when API key not set', async () => {
    delete process.env.OPENPIPE_API_KEY;
    vi.resetModules();
    const { triggerFineTune } = await import('../src/openpipe/client.js');

    const jobId = await triggerFineTune({
      baseModel: 'gpt-4o-mini',
      datasetFilters: { taskType: 'summarize' },
      suffix: 'v1',
    });
    expect(jobId).toBeNull();
  });

  it('getFineTuneStatus returns null when SDK unavailable', async () => {
    vi.stubEnv('OPENPIPE_API_KEY', 'test-key');
    vi.resetModules();
    const { getFineTuneStatus } = await import('../src/openpipe/client.js');

    const status = await getFineTuneStatus('ft-123');
    expect(status).toBeNull();
  });

  it('getFineTuneStatus returns null when API key not set', async () => {
    delete process.env.OPENPIPE_API_KEY;
    vi.resetModules();
    const { getFineTuneStatus } = await import('../src/openpipe/client.js');

    const status = await getFineTuneStatus('ft-nonexistent');
    expect(status).toBeNull();
  });

  it('createOpenPipeClient is idempotent', async () => {
    vi.stubEnv('OPENPIPE_API_KEY', 'test-key');
    vi.resetModules();
    const { createOpenPipeClient } = await import('../src/openpipe/client.js');

    // Calling multiple times should not throw
    createOpenPipeClient();
    createOpenPipeClient();
    createOpenPipeClient();
  });
});

describe('OpenPipe types', () => {
  it('TrainingEntry interface is used correctly by logTrainingData', async () => {
    vi.resetModules();
    const { logTrainingData } = await import('../src/openpipe/client.js');

    // Verifies the function accepts the correct shape without throwing
    await logTrainingData({
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
      idealOutput: 'Hi!',
      tags: { taskType: 'greeting', quality: 'high' },
    });
  });

  it('FineTuneStatus type has expected shape', async () => {
    vi.resetModules();
    const { getFineTuneStatus } = await import('../src/openpipe/client.js');

    // Returns null when disabled — verifies function signature
    const status = await getFineTuneStatus('test-id');
    expect(status).toBeNull();
  });
});
