/**
 * FILE PURPOSE: Type-safe analytics event catalog
 *
 * WHY: Single source of truth for all tracked events.
 *      Shared between frontend (PostHog capture) and backend (server-side tracking).
 *      Prevents typos and ensures consistent event naming.
 *
 * HOW: Const enum of event names + property interfaces for type-safe tracking.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

export const EVENTS = {
  PAGE_VIEWED: 'page_viewed',
  PROMPT_CREATED: 'prompt_created',
  PROMPT_PROMOTED: 'prompt_promoted',
  GENERATION_LOGGED: 'generation_logged',
  GENERATION_FEEDBACK_GIVEN: 'generation_feedback_given',
  DOCUMENT_UPLOADED: 'document_uploaded',
  EMBEDDING_SEARCHED: 'embedding_searched',
  COST_REPORT_VIEWED: 'cost_report_viewed',
  MEMORY_ADDED: 'memory_added',
  MEMORY_SEARCHED: 'memory_searched',
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];

/** Property shapes for each event — enables type-safe tracking. */
export interface EventProperties {
  [EVENTS.PAGE_VIEWED]: { path: string; title?: string };
  [EVENTS.PROMPT_CREATED]: { promptName: string; version: string };
  [EVENTS.PROMPT_PROMOTED]: { promptName: string; version: string; newPct: number };
  [EVENTS.GENERATION_LOGGED]: { model: string; taskType: string; latencyMs: number };
  [EVENTS.GENERATION_FEEDBACK_GIVEN]: { generationId: string; feedback: string; thumbs?: number };
  [EVENTS.DOCUMENT_UPLOADED]: { title: string; mimeType: string; chunkCount: number };
  [EVENTS.EMBEDDING_SEARCHED]: { query: string; modelId: string; resultCount: number };
  [EVENTS.COST_REPORT_VIEWED]: { totalCostUsd?: number };
  [EVENTS.MEMORY_ADDED]: { userId: string };
  [EVENTS.MEMORY_SEARCHED]: { query: string; resultCount: number };
}
