/**
 * FILE PURPOSE: Shared types across all apps in the monorepo
 *
 * WHY: Single source of truth for data models. All apps import from here
 *      instead of defining their own copies.
 * HOW: Export interfaces and types consumed by apps/web, apps/admin, etc.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

/** A single entry in the LLM playbook — displayed on the web app homepage. */
export interface PlaybookEntry {
  id: string;
  title: string;
  summary: string;
  category: 'resilience' | 'cost' | 'quality' | 'deployment';
  status: Status;
}

/** An admin user — displayed on the admin panel. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
}

/** Status values shared across apps for UI consistency. */
export type Status = 'active' | 'draft' | 'deprecated';

/** A prompt version record — §20 Prompt Versioning schema. */
export interface PromptVersion {
  id: string;
  prompt_name: string;
  version: string;
  content: string;
  content_hash: string;
  eval_score: number | null;
  active_pct: number;
  author: string;
  created_at: string;
}

/** An AI generation record — §21 Plane 3 schema. Maps to ai_generations table. */
export interface AIGeneration {
  id: string;
  created_at: string;
  user_id: string;
  session_id: string | null;
  prompt_hash: string;
  prompt_version: string;
  task_type: string;
  input_tokens: number;
  response_hash: string;
  output_tokens: number;
  model: string;
  model_version: string;
  latency_ms: number;
  cost_usd: string;
  user_feedback: 'accepted' | 'rejected' | 'edited' | 'regenerated' | 'ignored' | null;
  feedback_at: string | null;
  thumbs: -1 | 0 | 1 | null;
  user_edit_diff: string | null;
  quality_score: string | null;
  hallucination: boolean;
  guardrail_triggered: string[] | null;
}

/** Aggregated stats for AI generations — used by /api/generations/stats. */
export interface GenerationStats {
  totalCalls: number;
  avgLatencyMs: number;
  avgQualityScore: number | null;
  totalCostUsd: number;
}

/** A document record — §19 Input Pillar. Maps to documents table. */
export interface Document {
  id: string;
  title: string;
  source_url: string | null;
  mime_type: string;
  content_hash: string;
  chunk_count: number;
  embedding_model_id: string | null;
  ingested_at: string;
  valid_until: string | null;
  metadata: Record<string, unknown> | null;
}

/** An outcome record — §22 Moat Tracking. Maps to outcomes table. */
export interface Outcome {
  id: string;
  generation_id: string;
  user_id: string;
  outcome_type: 'conversion' | 'task_completed' | 'abandoned';
  outcome_value: Record<string, unknown> | null;
  created_at: string;
}
