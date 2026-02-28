/**
 * FILE PURPOSE: Database connection singleton
 *
 * WHY: Playbook §16 — PostgreSQL as the data layer.
 * HOW: postgres.js connection from DATABASE_URL, wrapped in Drizzle ORM.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL ?? '';

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
