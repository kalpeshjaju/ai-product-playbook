/**
 * FILE PURPOSE: Minimal API server for infrastructure verification
 *
 * WHY: Proves Railway deploy pipeline works end-to-end.
 * HOW: Native Node.js HTTP server — zero framework deps.
 *      Returns mock data using shared types.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import * as Sentry from '@sentry/node';
import { createServer } from 'node:http';
import type { PlaybookEntry, AdminUser } from '@playbook/shared-types';

// Sentry — no-op when DSN not set
const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });
}

const PORT = parseInt(process.env.PORT ?? '3002', 10);

const entries: PlaybookEntry[] = [
  { id: '1', title: 'JSON Extraction', summary: 'Multi-strategy repair', category: 'resilience', status: 'active' },
  { id: '2', title: 'Cost Ledger', summary: 'Budget enforcement', category: 'cost', status: 'active' },
];

const users: AdminUser[] = [
  { id: 'u1', name: 'Kalpesh Jaju', email: 'kalpesh@example.com', role: 'owner' },
];

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/health') {
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else if (req.url === '/api/entries') {
    res.end(JSON.stringify(entries));
  } else if (req.url === '/api/users') {
    res.end(JSON.stringify(users));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  // Railway expects stdout for health check logs
  process.stdout.write(`API server running on port ${PORT}\n`);
});
