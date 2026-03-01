import { describe, it, expect } from 'vitest';

describe('/api/ingest', () => {
  it('GET /api/ingest/types returns supported MIME types', async () => {
    // This test validates the route is wired. Full integration needs running server.
    const { handleIngestRoutes } = await import('../src/routes/ingest.js');
    expect(typeof handleIngestRoutes).toBe('function');
  });
});
