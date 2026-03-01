/**
 * FILE PURPOSE: Playbook entries CRUD — replaces hardcoded entries array
 *
 * WHY: Entries are the core content of the playbook. Storing them in Postgres
 *      (per DEC-006) enables CRUD from the admin panel and API consumers.
 *
 * HOW: Drizzle ORM against playbook_entries table. GET is public,
 *      mutations require admin auth (enforced by middleware).
 *
 * Routes:
 *   GET    /api/entries            — list entries (public, filterable)
 *   GET    /api/entries/:id        — get single entry (public)
 *   POST   /api/entries            — create entry (admin)
 *   PATCH  /api/entries/:id        — update entry (admin)
 *   DELETE /api/entries/:id        — delete entry (admin)
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq, desc } from 'drizzle-orm';
import { db, playbookEntries } from '../db/index.js';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;

const VALID_CATEGORIES = new Set(['resilience', 'cost', 'quality', 'deployment']);
const VALID_STATUSES = new Set(['active', 'draft', 'deprecated']);

export async function handleEntryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  try {
    const parsedUrl = new URL(url, 'http://localhost');

    // GET /api/entries/:id
    const idMatch = parsedUrl.pathname.match(/^\/api\/entries\/([^/]+)$/);
    if (idMatch && req.method === 'GET') {
      const id = idMatch[1]!;
      const [entry] = await db
        .select()
        .from(playbookEntries)
        .where(eq(playbookEntries.id, id))
        .limit(1);

      if (!entry) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Entry not found: ${id}` }));
        return;
      }

      res.end(JSON.stringify(entry));
      return;
    }

    // DELETE /api/entries/:id
    if (idMatch && req.method === 'DELETE') {
      const id = idMatch[1]!;
      const [deleted] = await db
        .delete(playbookEntries)
        .where(eq(playbookEntries.id, id))
        .returning();

      if (!deleted) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Entry not found: ${id}` }));
        return;
      }

      res.end(JSON.stringify({ deleted: id }));
      return;
    }

    // PATCH /api/entries/:id
    if (idMatch && req.method === 'PATCH') {
      const id = idMatch[1]!;
      const body = await parseBody(req);

      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title;
      if (body.summary !== undefined) updates.summary = body.summary;
      if (body.content !== undefined) updates.content = body.content;
      if (body.sectionRef !== undefined) updates.sectionRef = body.sectionRef;
      if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

      if (body.category !== undefined) {
        if (!VALID_CATEGORIES.has(body.category as string)) {
          res.statusCode = 400;
          res.end(JSON.stringify({
            error: `Invalid category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
          }));
          return;
        }
        updates.category = body.category;
      }

      if (body.status !== undefined) {
        if (!VALID_STATUSES.has(body.status as string)) {
          res.statusCode = 400;
          res.end(JSON.stringify({
            error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}`,
          }));
          return;
        }
        updates.status = body.status;
      }

      if (Object.keys(updates).length === 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'No fields to update' }));
        return;
      }

      updates.updatedAt = new Date();

      const [updated] = await db
        .update(playbookEntries)
        .set(updates)
        .where(eq(playbookEntries.id, id))
        .returning();

      if (!updated) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Entry not found: ${id}` }));
        return;
      }

      res.end(JSON.stringify(updated));
      return;
    }

    // GET /api/entries?category=...&status=...
    if (parsedUrl.pathname === '/api/entries' && req.method === 'GET') {
      const category = parsedUrl.searchParams.get('category');
      const status = parsedUrl.searchParams.get('status') ?? 'active';

      let query = db.select().from(playbookEntries).$dynamic();

      if (category && VALID_CATEGORIES.has(category)) {
        query = query.where(eq(playbookEntries.category, category));
      }
      if (status !== 'all') {
        query = query.where(eq(playbookEntries.status, status));
      }

      const rows = await query.orderBy(desc(playbookEntries.sortOrder));
      res.end(JSON.stringify(rows));
      return;
    }

    // POST /api/entries
    if (parsedUrl.pathname === '/api/entries' && req.method === 'POST') {
      const body = await parseBody(req);
      const title = body.title as string | undefined;
      const summary = body.summary as string | undefined;
      const category = body.category as string | undefined;

      if (!title || !summary || !category) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Required: title, summary, category' }));
        return;
      }

      if (!VALID_CATEGORIES.has(category)) {
        res.statusCode = 400;
        res.end(JSON.stringify({
          error: `Invalid category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
        }));
        return;
      }

      const [created] = await db
        .insert(playbookEntries)
        .values({
          title,
          summary,
          content: (body.content as string) ?? null,
          category,
          status: (body.status as string) ?? 'draft',
          sectionRef: (body.sectionRef as string) ?? null,
          sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        })
        .returning();

      res.statusCode = 201;
      res.end(JSON.stringify(created));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    process.stderr.write(`ERROR in entry routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
