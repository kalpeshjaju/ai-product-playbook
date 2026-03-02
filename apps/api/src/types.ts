/**
 * FILE PURPOSE: Shared types and error handling for API route handlers
 *
 * WHY: BodyParser and the catch-block error handler were duplicated across
 *      11+ route files. Centralising them here eliminates copy-paste drift.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;

export function handleRouteError(res: ServerResponse, routeName: string, err: unknown): void {
  process.stderr.write(`ERROR in ${routeName} routes: ${err}\n`);
  if (!res.writableEnded) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}
