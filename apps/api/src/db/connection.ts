/**
 * FILE PURPOSE: Database connection singleton with validation
 *
 * WHY: Playbook §16 — PostgreSQL as the data layer.
 * HOW: postgres.js connection from DATABASE_URL, wrapped in Drizzle ORM.
 *      Validates DATABASE_URL at module load. Throws in production if missing.
 *      Exports closeDatabase() for graceful shutdown.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL ?? '';

if (!connectionString) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: DATABASE_URL is required in production. Set it before starting the server.');
  }
  process.stderr.write('WARN: DATABASE_URL not set — database queries will fail. Set it in .env for local development.\n');
}

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

/** Close the database connection pool. Call during graceful shutdown. */
export async function closeDatabase(): Promise<void> {
  try {
    await client.end({ timeout: 5 });
  } catch {
    process.stderr.write('WARN: Error closing database connection\n');
  }
}
