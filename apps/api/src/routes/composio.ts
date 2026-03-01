/**
 * FILE PURPOSE: Composio API routes — expose agent tool integrations via HTTP
 *
 * WHY: Tier 2 tooling — lets external clients list available Composio actions
 *      and execute them through the API server.
 * HOW: Delegates to getAvailableActions() and executeAction() from shared-llm.
 *      Fail-open when COMPOSIO_API_KEY is not set.
 *
 * Routes:
 *   GET  /api/composio/actions    — list available actions (?app=...)
 *   POST /api/composio/execute    — execute an action
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAvailableActions, executeAction, scanOutput } from '@playbook/shared-llm';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;
const guardrailFailureMode = (process.env.LLAMAGUARD_FAILURE_MODE
  ?? (process.env.NODE_ENV === 'production' ? 'closed' : 'open')) as 'closed' | 'open';

export async function handleComposioRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  // Fail-open check
  if (!process.env.COMPOSIO_API_KEY) {
    res.end(JSON.stringify({ enabled: false, message: 'COMPOSIO_API_KEY not set' }));
    return;
  }

  // GET /api/composio/actions?app=...
  if (url.startsWith('/api/composio/actions') && req.method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams;
    const appName = params.get('app') ?? undefined;
    const actions = await getAvailableActions(appName);
    res.end(JSON.stringify(actions));
    return;
  }

  // POST /api/composio/execute
  if (url === '/api/composio/execute' && req.method === 'POST') {
    const body = await parseBody(req);
    const action = body.action as string | undefined;
    const params = body.params as Record<string, unknown> | undefined;
    if (!action || !params) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: action, params' }));
      return;
    }
    const result = await executeAction(action, params, body.entityId as string | undefined);

    // Guardrail: scan external action result for unsafe content (§21)
    const textToScan = typeof result.data === 'object'
      ? JSON.stringify(result.data)
      : String(result.data ?? '');
    if (textToScan.length > 0) {
      const guard = await scanOutput(textToScan, {
        enableLlamaGuard: true,
        failureMode: guardrailFailureMode,
      });
      if (!guard.passed) {
        res.statusCode = 422;
        res.end(JSON.stringify({
          error: 'Action result blocked by output guardrail',
          findings: guard.findings,
          actionName: action,
        }));
        return;
      }
    }

    res.end(JSON.stringify(result));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
}
