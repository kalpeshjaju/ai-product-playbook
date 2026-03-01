/**
 * FILE PURPOSE: API contract tests against real Postgres + Redis
 *
 * WHY: Unit tests mock everything. These contract tests hit a real API server
 *      backed by Postgres+pgvector and Redis to catch: schema drift,
 *      missing extensions, auth failures, response shape changes.
 *
 * HOW: In CI — GitHub Actions `services:` provides Postgres + Redis.
 *      Locally — requires local Postgres + Redis (will fail without them).
 *      Uses native fetch — no HTTP libraries needed.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { describe, it, expect } from 'vitest';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3002';

/** Auth headers — fail-open mode still requires header presence per auth.ts */
const TEST_API_KEY = process.env.TEST_API_KEY ?? 'test-api-key-for-ci';
const TEST_ADMIN_KEY = process.env.TEST_ADMIN_KEY ?? 'test-admin-key-for-ci';

/** Helper: JSON GET request */
async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'x-api-key': TEST_API_KEY },
  });
  const body = await res.json() as Record<string, unknown>;
  return { status: res.status, body };
}

/** Helper: JSON POST request */
async function post(
  path: string,
  data: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': TEST_API_KEY,
      'x-admin-key': TEST_ADMIN_KEY,
    },
    body: JSON.stringify(data),
  });
  const body = await res.json() as Record<string, unknown>;
  return { status: res.status, body };
}

/** Helper: JSON PATCH request */
async function patch(
  path: string,
  data: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': TEST_API_KEY,
      'x-admin-key': TEST_ADMIN_KEY,
    },
    body: JSON.stringify(data),
  });
  const body = await res.json() as Record<string, unknown>;
  return { status: res.status, body };
}

/** Helper: JSON DELETE request */
async function del(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: {
      'x-api-key': TEST_API_KEY,
      'x-admin-key': TEST_ADMIN_KEY,
    },
  });
  const body = await res.json() as Record<string, unknown>;
  return { status: res.status, body };
}

/** Helper: raw POST request (non-JSON body) */
async function postRaw(
  path: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-api-key': TEST_API_KEY,
    },
    body,
  });
  const responseBody = await res.json() as Record<string, unknown>;
  return { status: res.status, body: responseBody };
}

// ─── Health & Connectivity ─────────────────────────────────────

describe('Health & Connectivity', () => {
  it('API health returns ok with database connected', async () => {
    const { status, body } = await get('/api/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect((body.services as Record<string, unknown>).database).toBe('ok');
    expect(body.uptimeSeconds).toBeTypeOf('number');
    expect(body.timestamp).toBeTypeOf('string');
  });

  it('CORS preflight returns 204 with correct headers', async () => {
    const res = await fetch(`${API_URL}/api/health`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });

  it('unknown route returns 404', async () => {
    const { status, body } = await get('/api/nonexistent-route');
    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('response content-type is application/json', async () => {
    const res = await fetch(`${API_URL}/api/health`);
    expect(res.headers.get('content-type')).toBe('application/json');
  });
});

// ─── Prompt Versioning CRUD ────────────────────────────────────

describe('Prompt Versioning (Postgres)', () => {
  const testPromptName = `e2e-test-${Date.now()}`;
  let createdId: string;

  it('creates a prompt version', async () => {
    const { status, body } = await post('/api/prompts', {
      prompt_name: testPromptName,
      content: 'You are a helpful assistant for E2E testing.',
      author: 'e2e-test',
    });
    expect(status).toBe(201);
    expect(body.prompt_name).toBe(testPromptName);
    expect(body.version).toBeTypeOf('string');
    expect(body.content_hash).toBeTypeOf('string');
    expect(body.id).toBeTypeOf('string');
    createdId = body.id as string;
  });

  it('retrieves the active prompt version', async () => {
    const { status, body } = await get(`/api/prompts/${testPromptName}/active`);
    expect(status).toBe(200);
    expect(body.prompt_name).toBe(testPromptName);
    expect(body.content).toBe('You are a helpful assistant for E2E testing.');
  });

  it('updates traffic allocation', async () => {
    const { status, body } = await patch(`/api/prompts/${createdId}/traffic`, {
      active_pct: 50,
    });
    expect(status).toBe(200);
    expect(body.active_pct).toBe(50);
  });

  it('rejects invalid traffic allocation', async () => {
    const { status, body } = await patch(`/api/prompts/${createdId}/traffic`, {
      active_pct: 150,
    });
    expect(status).toBe(400);
    expect(body.error).toBeTypeOf('string');
  });

  it('returns 404 for non-existent prompt name', async () => {
    const { status } = await get('/api/prompts/definitely-does-not-exist/active');
    expect(status).toBe(404);
  });

  it('promotes a prompt version through the ladder', async () => {
    // First set traffic to 0% to reset
    await patch(`/api/prompts/${createdId}/traffic`, { active_pct: 0 });
    // Promote: 0% → 10%
    const { status, body } = await post(`/api/prompts/${testPromptName}/promote`, {
      version: 'v1.0.0',
    });
    expect(status).toBe(200);
    expect(body.previousPct).toBe(0);
    expect(body.newPct).toBe(10);
    expect(body.nextStep).toBeTypeOf('string');
  });

  it('rejects promote without version', async () => {
    const { status, body } = await post(`/api/prompts/${testPromptName}/promote`, {});
    expect(status).toBe(400);
    expect(body.error).toContain('version');
  });
});

// ─── Generation Logging ────────────────────────────────────────

describe('Generation Logging (Postgres)', () => {
  const testUserId = `e2e-user-${Date.now()}`;
  let generationId: string;

  it('logs a generation record', async () => {
    const { status, body } = await post('/api/generations', {
      userId: testUserId,
      promptText: 'Test prompt for E2E',
      promptVersion: 'v1.0.0',
      taskType: 'e2e-test',
      inputTokens: 50,
      responseText: 'Test response from E2E',
      outputTokens: 30,
      model: 'test-model',
      modelVersion: 'v1',
      latencyMs: 150,
      costUsd: 0.001,
    });
    expect(status).toBe(201);
    expect(body.id).toBeTypeOf('string');
    expect(body.user_id).toBe(testUserId);
    generationId = body.id as string;
  });

  it('retrieves generations for user', async () => {
    const { status, body } = await get(`/api/generations?userId=${testUserId}`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const generations = body as unknown as Array<Record<string, unknown>>;
    expect(generations.length).toBeGreaterThanOrEqual(1);
    expect(generations[0]?.user_id).toBe(testUserId);
  });

  it('retrieves generation stats', async () => {
    const { status, body } = await get(`/api/generations/stats?userId=${testUserId}`);
    expect(status).toBe(200);
    expect(body.totalCalls).toBeTypeOf('number');
    expect(body.avgLatencyMs).toBeTypeOf('number');
  });

  it('submits feedback on a generation', async () => {
    const { status, body } = await patch(`/api/feedback/${generationId}`, {
      userFeedback: 'accepted',
      thumbs: 1,
    });
    expect(status).toBe(200);
    expect(body.user_feedback).toBe('accepted');
    expect(body.thumbs).toBe(1);
  });

  it('rejects invalid feedback values', async () => {
    const { status } = await patch(`/api/feedback/${generationId}`, {
      userFeedback: 'invalid-value',
    });
    expect(status).toBe(400);
  });

  it('submits an outcome for a generation', async () => {
    const { status, body } = await post(`/api/feedback/${generationId}/outcome`, {
      outcomeType: 'task_completed',
      userId: testUserId,
      outcomeValue: { detail: 'e2e test' },
    });
    expect(status).toBe(201);
    expect(body.outcome_type).toBe('task_completed');
  });
});

// ─── Cost Observability ────────────────────────────────────────

describe('Cost Observability', () => {
  it('returns cost report structure', async () => {
    const { status, body } = await get('/api/costs');
    expect(status).toBe(200);
    expect(body).toHaveProperty('totalCostUSD');
    expect(body).toHaveProperty('byAgent');
  });

  it('resets cost counters (admin-only)', async () => {
    const { status, body } = await post('/api/costs/reset', {});
    expect(status).toBe(200);
    expect(body.status).toBe('reset');
    expect(body).toHaveProperty('report');
  });
});

// ─── Document Ingestion ────────────────────────────────────────

describe('Document Ingestion (Postgres)', () => {
  it('ingests a text document', async () => {
    const { status, body } = await post('/api/documents', {
      title: `E2E Test Doc ${Date.now()}`,
      content: 'This is a test document for E2E infrastructure testing. It needs enough content to generate at least one chunk for the embedding pipeline.',
      mimeType: 'text/plain',
    });
    // 201 if new, 200 if duplicate
    expect([200, 201]).toContain(status);
    expect(body.document).toBeTruthy();
  });

  it('lists documents', async () => {
    const { status, body } = await get('/api/documents');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns 404 for non-existent document ID', async () => {
    const { status, body } = await get('/api/documents/00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
    expect(body.error).toContain('not found');
  });

  it('rejects upload with unsupported content-type', async () => {
    const { status, body } = await postRaw(
      '/api/documents/upload',
      Buffer.from('not a real file'),
      'application/octet-stream',
    );
    expect(status).toBe(400);
    expect(body.error).toContain('Unsupported Content-Type');
  });
});

// ─── Static Data Routes ────────────────────────────────────────

describe('Static Data Routes', () => {
  it('returns playbook entries', async () => {
    const { status, body } = await get('/api/entries');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const entries = body as unknown as Array<Record<string, unknown>>;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toHaveProperty('title');
    expect(entries[0]).toHaveProperty('summary');
  });

  it('returns users list', async () => {
    const { status, body } = await get('/api/users');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ─── Memory Routes (fail-open) ─────────────────────────────────

describe('Memory Routes (fail-open)', () => {
  it('GET /:userId returns response (data or disabled)', async () => {
    const { status, body } = await get('/api/memory/test-user');
    expect([200]).toContain(status);
    expect(
      Array.isArray(body) || (body as Record<string, unknown>).enabled === false
    ).toBe(true);
  });

  it('POST / returns response (created or disabled)', async () => {
    const { status, body } = await post('/api/memory', {
      content: 'Test memory for E2E',
      userId: 'e2e-test-user',
    });
    expect([200, 201]).toContain(status);
    expect(
      body.id !== undefined || (body as Record<string, unknown>).enabled === false
    ).toBe(true);
  });

  it('GET /search returns response (results or disabled)', async () => {
    const { status, body } = await get('/api/memory/search?q=test&userId=e2e-test-user');
    expect([200]).toContain(status);
    expect(
      Array.isArray(body) || (body as Record<string, unknown>).enabled === false
    ).toBe(true);
  });

  it('DELETE /:id returns response (deleted or disabled)', async () => {
    const { status, body } = await del('/api/memory/fake-memory-id');
    expect([200]).toContain(status);
    expect(
      body.deleted !== undefined || (body as Record<string, unknown>).enabled === false
    ).toBe(true);
  });
});

// ─── User Preferences CRUD ─────────────────────────────────────

describe('User Preferences (Postgres)', () => {
  const testUserId = `e2e-pref-user-${Date.now()}`;
  const testKey = 'preferred_model';

  it('creates an explicit preference', async () => {
    const { status, body } = await post(`/api/preferences/${testUserId}`, {
      preferenceKey: testKey,
      preferenceValue: 'claude-opus-4-6',
    });
    expect(status).toBe(201);
    expect(body.user_id).toBe(testUserId);
    expect(body.preference_key).toBe(testKey);
    expect(body.source).toBe('explicit');
    expect(body.confidence).toBe('1.00');
  });

  it('retrieves preferences for user', async () => {
    const { status, body } = await get(`/api/preferences/${testUserId}`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const prefs = body as unknown as Array<Record<string, unknown>>;
    expect(prefs.length).toBeGreaterThanOrEqual(1);
    expect(prefs[0]?.preference_key).toBe(testKey);
  });

  it('updates a preference value', async () => {
    const { status, body } = await patch(`/api/preferences/${testUserId}/${testKey}`, {
      preferenceValue: 'claude-sonnet-4-6',
    });
    expect(status).toBe(200);
    expect(body.preference_value).toBe('claude-sonnet-4-6');
  });

  it('rejects update without preferenceValue', async () => {
    const { status, body } = await patch(`/api/preferences/${testUserId}/${testKey}`, {});
    expect(status).toBe(400);
    expect(body.error).toBeTypeOf('string');
  });

  it('deletes a preference', async () => {
    const { status, body } = await del(`/api/preferences/${testUserId}/${testKey}`);
    expect(status).toBe(200);
    expect(body.deleted).toBe(testKey);
  });

  it('returns 404 deleting non-existent preference', async () => {
    const { status } = await del(`/api/preferences/${testUserId}/nonexistent-key`);
    expect(status).toBe(404);
  });

  it('triggers preference inference from feedback', async () => {
    const { status, body } = await post(`/api/preferences/${testUserId}/infer`, {});
    expect(status).toBe(200);
    expect(body.inferred).toBeTypeOf('number');
    expect(Array.isArray(body.preferences)).toBe(true);
  });
});

// ─── Few-Shot Bank CRUD ────────────────────────────────────────

describe('Few-Shot Bank (Postgres)', () => {
  const taskType = `e2e-task-${Date.now()}`;
  let createdId: string;

  it('manually adds a few-shot example', async () => {
    const { status, body } = await post('/api/few-shot', {
      taskType,
      inputText: 'What is the capital of France?',
      outputText: 'Paris is the capital of France.',
      qualityScore: 0.95,
    });
    expect(status).toBe(201);
    expect(body.task_type).toBe(taskType);
    expect(body.curated_by).toBe('manual');
    expect(body.is_active).toBe(true);
    expect(body.id).toBeTypeOf('string');
    createdId = body.id as string;
  });

  it('retrieves examples by taskType', async () => {
    const { status, body } = await get(`/api/few-shot?taskType=${taskType}`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const examples = body as unknown as Array<Record<string, unknown>>;
    expect(examples.length).toBeGreaterThanOrEqual(1);
    expect(examples[0]?.task_type).toBe(taskType);
  });

  it('rejects GET without taskType', async () => {
    const { status, body } = await get('/api/few-shot');
    expect(status).toBe(400);
    expect(body.error).toContain('taskType');
  });

  it('rejects POST with missing fields', async () => {
    const { status, body } = await post('/api/few-shot', {
      taskType,
      // missing inputText and outputText
    });
    expect(status).toBe(400);
    expect(body.error).toBeTypeOf('string');
  });

  it('soft-deletes a few-shot example', async () => {
    const { status, body } = await del(`/api/few-shot/${createdId}`);
    expect(status).toBe(200);
    expect(body.deactivated).toBe(createdId);
  });

  it('auto-curates from top generations (build)', async () => {
    const { status, body } = await post('/api/few-shot/build', { taskType });
    expect(status).toBe(200);
    expect(body.taskType).toBe(taskType);
    expect(body.candidatesFound).toBeTypeOf('number');
    expect(body.added).toBeTypeOf('number');
  });

  it('rejects build without taskType', async () => {
    const { status, body } = await post('/api/few-shot/build', {});
    expect(status).toBe(400);
    expect(body.error).toContain('taskType');
  });
});

// ─── Embedding Routes (validation) ────────────────────────────

describe('Embedding Routes (validation)', () => {
  it('rejects search without q param', async () => {
    const { status, body } = await get('/api/embeddings/search?modelId=text-embedding-3-small');
    expect(status).toBe(400);
    expect(body.error).toContain('q');
  });

  it('rejects search without modelId (§19 HARD GATE)', async () => {
    const { status, body } = await get('/api/embeddings/search?q=test+query');
    expect(status).toBe(400);
    expect(body.error).toContain('modelId');
  });

  it('rejects POST with missing fields', async () => {
    const { status, body } = await post('/api/embeddings', {
      sourceType: 'document',
      // missing sourceId, contentHash, embedding, modelId
    });
    expect(status).toBe(400);
    expect(body.error).toContain('Required');
  });
});

// ─── Composio Routes (fail-open) ──────────────────────────────

describe('Composio Routes (fail-open)', () => {
  it('GET /actions returns deterministic response', async () => {
    const { status, body } = await get('/api/composio/actions');
    expect(status).toBe(200);
    if (process.env.COMPOSIO_API_KEY) {
      expect(body.enabled).not.toBe(false);
    } else {
      expect(body.enabled).toBe(false);
      expect(body.message).toContain('COMPOSIO_API_KEY');
    }
  });

  it('POST /execute returns disabled or requires params', async () => {
    const { status, body } = await post('/api/composio/execute', {});
    if (!process.env.COMPOSIO_API_KEY) {
      expect(status).toBe(200);
      expect(body.enabled).toBe(false);
    } else {
      // Key present — should require action and params
      expect(status).toBe(400);
      expect(body.error).toContain('action');
    }
  });
});

// ─── OpenPipe Routes (fail-open) ──────────────────────────────

describe('OpenPipe Routes (fail-open)', () => {
  it('GET /finetune/:jobId returns disabled or job status', async () => {
    const { status, body } = await get('/api/openpipe/finetune/test-job');
    expect(status).toBe(200);
    if (process.env.OPENPIPE_API_KEY) {
      expect(body.enabled).not.toBe(false);
    } else {
      expect(body.enabled).toBe(false);
      expect(body.message).toContain('OPENPIPE_API_KEY');
    }
  });

  it('POST /log returns disabled or requires messages', async () => {
    const { status, body } = await post('/api/openpipe/log', {});
    if (!process.env.OPENPIPE_API_KEY) {
      expect(status).toBe(200);
      expect(body.enabled).toBe(false);
    } else {
      expect(status).toBe(400);
      expect(body.error).toContain('messages');
    }
  });

  it('POST /finetune returns disabled or requires baseModel', async () => {
    const { status, body } = await post('/api/openpipe/finetune', {});
    if (!process.env.OPENPIPE_API_KEY) {
      expect(status).toBe(200);
      expect(body.enabled).toBe(false);
    } else {
      expect(status).toBe(400);
      expect(body.error).toContain('baseModel');
    }
  });
});

// ─── Transcription Routes (validation) ────────────────────────

describe('Transcription Routes (validation)', () => {
  it('rejects empty audio body', async () => {
    const { status, body } = await postRaw('/api/transcribe', Buffer.alloc(0), 'audio/wav');
    expect(status).toBe(400);
    expect(body.error).toContain('Empty audio body');
  });
});
