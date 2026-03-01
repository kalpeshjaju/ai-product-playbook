/**
 * FILE PURPOSE: Barrel export for database layer
 *
 * WHY: Single import point for db instance, tables, and inferred types.
 */

export { db } from './connection.js';
export {
  promptVersions,
  aiGenerations,
  embeddings,
  documents,
  userPreferences,
  outcomes,
} from './schema.js';
