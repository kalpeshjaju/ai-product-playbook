/**
 * FILE PURPOSE: Cost observability API routes
 *
 * WHY: Exposes CostLedger data via HTTP for dashboards and monitoring.
 *      Admin-only reset to clear counters between runs.
 * HOW: GET returns the full observability report, POST /reset requires
 *      x-admin-key header matching ADMIN_API_KEY env var.
 *
 * Routes:
 *   GET  /api/costs       — returns ObservabilityReport
 *   POST /api/costs/reset — admin-only reset (clears all cost tracking)
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { costLedger } from '@playbook/shared-llm';

export function handleCostRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
): void {
  // GET /api/costs — return full observability report
  if (url === '/api/costs' && req.method === 'GET') {
    res.end(JSON.stringify(costLedger.getObservabilityReport()));
    return;
  }

  // POST /api/costs/reset — admin-only reset
  if (url === '/api/costs/reset' && req.method === 'POST') {
    const adminKey = process.env.ADMIN_API_KEY;
    const provided = req.headers['x-admin-key'];

    if (!adminKey || typeof provided !== 'string' || provided !== adminKey) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Forbidden: invalid or missing x-admin-key' }));
      return;
    }

    costLedger.reset();
    res.end(JSON.stringify({ status: 'reset', report: costLedger.getReport() }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
}
