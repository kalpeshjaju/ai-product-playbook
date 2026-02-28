/**
 * FILE PURPOSE: Database schema — prompt_versions, ai_generations, embeddings
 *
 * WHY: Playbook §20 (prompt versioning), §21 Plane 3 (AI quality logging),
 *      §16 (pgvector for embeddings). Single source of truth for all tables.
 *
 * HOW: Drizzle ORM schema definitions. Run `npm run db:push` to sync to DB.
 *
 * DEFERRED: user_preferences, match_quality_signals, outcomes tables
 *           → Month 3–6+ per §20 Layer Investment Sequencing.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  smallint,
  index,
  unique,
  jsonb,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Custom pgvector type ────────────────────────────────────────────────────
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map(Number);
  },
});

// ─── Table 1: prompt_versions (§20 line 4986) ───────────────────────────────
// Tracks every prompt version with traffic allocation for A/B testing.
// Promotion flow: 0% → 10% → 50% → 100% (§22).
export const promptVersions = pgTable(
  'prompt_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    promptName: text('prompt_name').notNull(),
    version: text('version').notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash').notNull(),
    evalScore: numeric('eval_score', { precision: 3, scale: 2 }),
    activePct: integer('active_pct').default(0).notNull(),
    author: text('author').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_prompt_name_version').on(table.promptName, table.version),
  ],
);

// ─── Table 2: ai_generations (§21 lines 5151-5196 — Plane 3) ────────────────
// Every LLM generation logged for quality tracking, cost analysis, and debugging.
// ALL columns from the playbook's exact Plane 3 schema.
export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

    // WHO
    userId: text('user_id').notNull(),
    sessionId: text('session_id'),

    // WHAT WAS ASKED
    promptHash: text('prompt_hash').notNull(),
    promptVersion: text('prompt_version').notNull(),
    taskType: text('task_type').notNull(),
    inputTokens: integer('input_tokens').notNull(),

    // WHAT WAS RETURNED
    responseHash: text('response_hash').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    model: text('model').notNull(),
    modelVersion: text('model_version').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),

    // WAS IT GOOD (user feedback)
    userFeedback: text('user_feedback'), // accepted | rejected | edited | regenerated | ignored
    feedbackAt: timestamp('feedback_at', { withTimezone: true }),
    thumbs: smallint('thumbs'),           // -1 | 0 | 1
    userEditDiff: text('user_edit_diff'),

    // AUTOMATED QUALITY
    qualityScore: numeric('quality_score', { precision: 3, scale: 2 }),
    hallucination: boolean('hallucination').default(false),
    guardrailTriggered: text('guardrail_triggered').array(),
  },
  (table) => [
    index('idx_ai_gen_user').on(table.userId, table.createdAt),
    index('idx_ai_gen_quality').on(table.createdAt, table.qualityScore),
    index('idx_ai_gen_prompt').on(table.promptVersion, table.qualityScore),
    index('idx_ai_gen_model').on(table.model, table.hallucination),
  ],
);

// ─── Table 3: embeddings (pgvector — §16, §19) ──────────────────────────────
// Stores vector embeddings with model_id tagging (§19 [HARD GATE]).
// Uses HNSW index for approximate nearest-neighbor search.
export const embeddings = pgTable(
  'embeddings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    contentHash: text('content_hash').notNull(),
    embedding: vector('embedding').notNull(),
    modelId: text('model_id').notNull(), // §19 [HARD GATE]: vectors tagged with model_id
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  () => [
    // HNSW index created via raw SQL in migration since Drizzle doesn't
    // natively support pgvector index operators. Run manually:
    // CREATE INDEX idx_embeddings_hnsw ON embeddings
    //   USING hnsw (embedding vector_cosine_ops);
    sql`-- HNSW index: run CREATE INDEX idx_embeddings_hnsw ON embeddings USING hnsw (embedding vector_cosine_ops) after migration`,
  ],
);
