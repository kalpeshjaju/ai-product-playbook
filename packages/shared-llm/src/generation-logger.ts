/**
 * FILE PURPOSE: Structured log record builder for the ai_generations table
 *
 * WHY: Every LLM call must be logged to ai_generations (§21 Plane 3).
 *      This module creates the record shape without importing Drizzle,
 *      keeping shared-llm database-agnostic.
 *
 * HOW: Accepts raw call metadata, hashes prompt + response with SHA-256,
 *      formats cost as string (numeric column), returns a complete record
 *      ready for DB insertion.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { createHash } from 'node:crypto';

/** Input fields provided by the caller when logging a generation. */
export interface GenerationLogInput {
  userId: string;
  sessionId?: string;
  promptText: string;
  promptVersion: string;
  taskType: string;
  inputTokens: number;
  responseText: string;
  outputTokens: number;
  model: string;
  modelVersion: string;
  latencyMs: number;
  costUsd: number;
  qualityScore?: number;
  hallucination?: boolean;
  guardrailTriggered?: string[];
}

/** Output record shape matching the ai_generations table columns. */
export interface GenerationLogRecord {
  userId: string;
  sessionId: string | null;
  promptHash: string;
  promptVersion: string;
  taskType: string;
  inputTokens: number;
  responseHash: string;
  outputTokens: number;
  model: string;
  modelVersion: string;
  latencyMs: number;
  costUsd: string;
  qualityScore: string | null;
  hallucination: boolean;
  guardrailTriggered: string[] | null;
}

/** SHA-256 hash of a string, returned as hex. */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Create a structured log record for the ai_generations table.
 *
 * Hashes prompt and response text with SHA-256 (same pattern as routes/prompts.ts).
 * Formats costUsd as string for the numeric(10,6) column.
 */
export function createGenerationLog(input: GenerationLogInput): GenerationLogRecord {
  return {
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    promptHash: sha256(input.promptText),
    promptVersion: input.promptVersion,
    taskType: input.taskType,
    inputTokens: input.inputTokens,
    responseHash: sha256(input.responseText),
    outputTokens: input.outputTokens,
    model: input.model,
    modelVersion: input.modelVersion,
    latencyMs: input.latencyMs,
    costUsd: input.costUsd.toFixed(6),
    qualityScore: input.qualityScore !== undefined
      ? input.qualityScore.toFixed(2)
      : null,
    hallucination: input.hallucination ?? false,
    guardrailTriggered: input.guardrailTriggered ?? null,
  };
}
