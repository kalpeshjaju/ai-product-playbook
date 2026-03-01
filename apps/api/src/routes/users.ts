/**
 * FILE PURPOSE: Users route — delegates to Clerk for user management
 *
 * WHY: Per DEC-006, users come from Clerk (not Strapi or hardcoded arrays).
 *      This replaces the hardcoded users[] in server.ts with real Clerk data.
 *
 * HOW: Uses @clerk/backend getUserList() to fetch users. Maps Clerk's User
 *      object to AdminUser shape defined in shared-types.
 *      Fail-open: returns empty array when CLERK_SECRET_KEY is not set.
 *
 * Routes:
 *   GET /api/users — list users from Clerk
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminUser } from '@playbook/shared-types';

export async function handleUserRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
): Promise<void> {
  try {
    const parsedUrl = new URL(url, 'http://localhost');

    // GET /api/users
    if (parsedUrl.pathname === '/api/users' && req.method === 'GET') {
      const secretKey = process.env.CLERK_SECRET_KEY;

      if (!secretKey) {
        // Fail-open: no Clerk configured — return empty array
        res.end(JSON.stringify([]));
        return;
      }

      const { createClerkClient } = await import('@clerk/backend');
      const clerk = createClerkClient({ secretKey });
      const { data: clerkUsers } = await clerk.users.getUserList({ limit: 100 });

      const users: AdminUser[] = clerkUsers.map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'Unknown',
        email: u.emailAddresses[0]?.emailAddress ?? '',
        role: (u.publicMetadata?.role as AdminUser['role']) ?? 'viewer',
      }));

      res.end(JSON.stringify(users));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    process.stderr.write(`ERROR in user routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
