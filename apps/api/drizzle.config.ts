/**
 * FILE PURPOSE: Drizzle Kit configuration for database migrations
 *
 * WHY: Playbook §16 — PostgreSQL + pgvector as the data layer.
 * HOW: Points Drizzle Kit at our schema and DATABASE_URL for generate/migrate/push.
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
