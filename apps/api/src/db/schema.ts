/**
 * FILE PURPOSE: Database schema — prompt_versions, ai_generations, embeddings
 *
 * WHY: Playbook §20 (prompt versioning), §21 Plane 3 (AI quality logging),
 *      §16 (pgvector for embeddings). Single source of truth for all tables.
 *
 * HOW: Drizzle ORM schema definitions. Run `npm run db:push` to sync to DB.
 *
 * Tables: prompt_versions, ai_generations, embeddings, documents,
 *         user_preferences, outcomes, playbook_entries.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
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
  fromDriver(value: unknown): number[] {
    const str = typeof value === 'string' ? value : String(value);
    return str
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

// ─── Table 4: documents (§19 Input Pillar) ──────────────────────────────────
// Tracks ingested documents with content hashing for dedup,
// chunk count for embedding status, and freshness via validUntil.
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    sourceUrl: text('source_url'),
    mimeType: text('mime_type').notNull().default('text/plain'),
    contentHash: text('content_hash').notNull(),
    chunkCount: integer('chunk_count').default(0).notNull(),
    embeddingModelId: text('embedding_model_id'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    metadata: jsonb('metadata'),
    // §19 Input Pillar — raw source storage, chunking, enrichment tracking
    rawContent: customType<{ data: Buffer; driverParam: Buffer }>({
      dataType: () => 'bytea',
      toDriver: (v: Buffer) => v,
      fromDriver: (v: unknown) => v as Buffer,
    })('raw_content'),
    rawContentUrl: text('raw_content_url'),
    chunkStrategy: text('chunk_strategy').notNull().default('fixed'),
    enrichmentStatus: jsonb('enrichment_status').default({}),
    sourceType: text('source_type').notNull().default('document'),
  },
  (table) => [
    index('idx_documents_hash').on(table.contentHash),
    index('idx_documents_ingested').on(table.ingestedAt),
  ],
);

// ─── Table 5: user_preferences (§20 Layer 4 Personalization) ────────────────
// Stores per-user preferences with source tracking (explicit vs inferred).
// Confidence score enables gradual preference learning from feedback data.
export const userPreferences = pgTable(
  'user_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    preferenceKey: text('preference_key').notNull(),
    preferenceValue: jsonb('preference_value').notNull(),
    source: text('source').notNull().default('default'), // explicit | inferred | default
    confidence: numeric('confidence', { precision: 3, scale: 2 }).default('1.00'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_user_prefs_user').on(table.userId),
    unique('uq_user_pref_key').on(table.userId, table.preferenceKey),
  ],
);

// ─── Table 6: outcomes (§22 Moat Tracking) ──────────────────────────────────
// Links AI generation results to business outcomes for feedback loops.
// outcomeType tracks the nature; outcomeValue holds structured details.
export const outcomes = pgTable(
  'outcomes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    generationId: uuid('generation_id').notNull().references(() => aiGenerations.id),
    userId: text('user_id').notNull(),
    outcomeType: text('outcome_type').notNull(), // conversion | task_completed | abandoned
    outcomeValue: jsonb('outcome_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_outcomes_generation').on(table.generationId),
    index('idx_outcomes_user').on(table.userId, table.createdAt),
  ],
);

// ─── Table 7: few_shot_bank (§20 Layer 3 Few-Shot Learning) ─────────────────
// Stores high-quality generation examples curated from production data.
// Used to construct few-shot prompts for improved output quality.
export const fewShotBank = pgTable(
  'few_shot_bank',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taskType: text('task_type').notNull(),
    inputText: text('input_text').notNull(),
    outputText: text('output_text').notNull(),
    qualityScore: numeric('quality_score', { precision: 3, scale: 2 }).notNull(),
    sourceGenerationId: uuid('source_generation_id').references(() => aiGenerations.id),
    curatedBy: text('curated_by').notNull().default('auto'), // auto | manual
    isActive: boolean('is_active').default(true).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_few_shot_task').on(table.taskType, table.qualityScore),
    index('idx_few_shot_active').on(table.isActive, table.taskType),
  ],
);

// ─── Table 8: playbook_entries (replaces hardcoded entries array) ────────────
// Content entries for the playbook. Schema informed by Strapi scaffold
// (services/strapi/) but stored directly in Postgres per DEC-006.
export const playbookEntries = pgTable(
  'playbook_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    content: text('content'),
    category: text('category').notNull(), // resilience | cost | quality | deployment
    status: text('status').notNull().default('draft'), // active | draft | deprecated
    sectionRef: text('section_ref'),      // e.g. "§18", "§21" — links to playbook section
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_entries_category').on(table.category, table.status),
    index('idx_entries_status').on(table.status, table.sortOrder),
  ],
);
