/**
 * FILE PURPOSE: Memory API routes — expose agent memory layer via HTTP
 *
 * WHY: Tier 2 tooling — lets external clients add, search, list, and delete
 *      agent memories through the API server.
 * HOW: Delegates to createMemoryProvider() from shared-llm. Fail-open when
 *      MEM0_API_KEY is not set (returns { enabled: false }).
 *
 * Routes:
 *   POST   /api/memory             — add a memory
 *   GET    /api/memory/search      — search memories (?q=...&userId=...)
 *   GET    /api/memory/:userId     — get all memories for user
 *   DELETE /api/memory/:id         — delete specific memory
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMemoryProvider, scanOutput } from '@playbook/shared-llm';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;
const guardrailFailureMode = (process.env.LLAMAGUARD_FAILURE_MODE
  ?? (process.env.NODE_ENV === 'production' ? 'closed' : 'open')) as 'closed' | 'open';

export async function handleMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  try {
  // Fail-open check — return 503 so clients know memory is unavailable
  if (!process.env.MEM0_API_KEY && !process.env.ZEP_API_KEY) {
    res.statusCode = 503;
    res.end(JSON.stringify({ enabled: false, message: 'No memory provider configured' }));
    return;
  }

  const memory = createMemoryProvider();

  // GET /api/memory/search?q=...&userId=...
  if (url.startsWith('/api/memory/search') && req.method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams;
    const q = params.get('q') ?? '';
    const userId = params.get('userId') ?? '';
    if (!q || !userId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required query params: q, userId' }));
      return;
    }
    const results = await memory.search(q, { userId, limit: 10 });

    // Guardrail: scan memory content before returning (§21)
    const memoryText = results.map(r => r.entry.content).join('\n');
    if (memoryText.length > 0) {
      const guard = await scanOutput(memoryText, {
        enableLlamaGuard: true,
        failureMode: guardrailFailureMode,
      });
      if (!guard.passed) {
        res.statusCode = 422;
        res.end(JSON.stringify({
          error: 'Memory content blocked by output guardrail',
          findings: guard.findings,
        }));
        return;
      }
    }

    res.end(JSON.stringify(results));
    return;
  }

  // GET /api/memory/:userId — get all memories
  const userMatch = url.match(/^\/api\/memory\/([^/?]+)$/);
  if (userMatch && req.method === 'GET') {
    const userId = userMatch[1]!;
    const entries = await memory.getAll(userId);

    // Guardrail: scan memory content before returning (§21)
    const memoryText = entries.map(e => e.content).join('\n');
    if (memoryText.length > 0) {
      const guard = await scanOutput(memoryText, {
        enableLlamaGuard: true,
        failureMode: guardrailFailureMode,
      });
      if (!guard.passed) {
        res.statusCode = 422;
        res.end(JSON.stringify({
          error: 'Memory content blocked by output guardrail',
          findings: guard.findings,
        }));
        return;
      }
    }

    res.end(JSON.stringify(entries));
    return;
  }

  // DELETE /api/memory/:id
  if (userMatch && req.method === 'DELETE') {
    const memoryId = userMatch[1]!;
    await memory.delete(memoryId);
    res.end(JSON.stringify({ deleted: memoryId }));
    return;
  }

  // POST /api/memory — add a memory
  if (url === '/api/memory' && req.method === 'POST') {
    const body = await parseBody(req);
    const content = body.content as string | undefined;
    const userId = body.userId as string | undefined;
    if (!content || !userId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: content, userId' }));
      return;
    }
    const id = await memory.add(content, {
      userId,
      agentId: body.agentId as string | undefined,
      metadata: body.metadata as Record<string, string | number | boolean> | undefined,
    });
    res.statusCode = 201;
    res.end(JSON.stringify({ id }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    process.stderr.write(`ERROR in memory routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
