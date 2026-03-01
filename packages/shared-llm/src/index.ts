/**
 * FILE PURPOSE: Barrel export for LLM resilience patterns + proxy client
 *
 * WHY: Single import point for all LLM utilities.
 *      Import: `import { createLLMClient, extractJson, costLedger } from '@playbook/shared-llm'`
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

export { createLLMClient } from './llm-client.js';
export type { OpenAI } from './llm-client.js';

export { extractJson } from './json-extractor.js';
export type { ExtractionResult } from './json-extractor.js';

export { CostLedger, costLedger, CostLimitExceededError } from './cost-ledger.js';
export type {
  TokenUsage,
  CostReport,
  LLMCallRecord,
  AgentObservability,
  ObservabilityReport,
} from './cost-ledger.js';

export { FallbackMonitor, fallbackMonitor } from './fallback-monitor.js';
export type { FallbackEvent, FallbackStats, AlertLevel } from './fallback-monitor.js';

// ─── Tier 2: Agent Memory Layer (§20) ───────────────────────────────────────
export { createMemoryProvider, Mem0Provider, ZepProvider } from './memory/index.js';
export type {
  AgentMemoryProvider,
  MemoryEntry,
  MemorySearchResult,
  AddMemoryOptions,
  SearchMemoryOptions,
} from './memory/index.js';

// ─── Tier 2: Composio Agent Tool Integrations (§20) ────────────────────────
export { createComposioClient, getAvailableActions, executeAction } from './composio/index.js';
export type { ComposioAction, ComposioActionResult } from './composio/index.js';

// ─── Tier 2: Intelligent Model Routing (§18) ───────────────────────────────
export { routeQuery } from './routing/index.js';
export type { ModelTier, RoutingConfig, RoutingDecision } from './routing/index.js';

// ─── Tier 2: OpenPipe Fine-Tuning Pipeline (§20) ───────────────────────────
export {
  createOpenPipeClient,
  logTrainingData,
  triggerFineTune,
  getFineTuneStatus,
} from './openpipe/index.js';
export type { TrainingEntry, FineTuneStatus } from './openpipe/index.js';

// ─── Tier 1: Output Guardrails (§21) ────────────────────────────────────────
export { scanOutput, RegexScanner, LlamaGuardScanner } from './guardrails/index.js';
export type {
  GuardrailSeverity,
  GuardrailFinding,
  GuardrailResult,
  GuardrailScanner,
  ScanConfig,
} from './guardrails/index.js';

// ─── Document Parsing (§19 INPUT) ───────────────────────────────────────────
export { parseDocument, isSupportedMimeType } from './parsing/index.js';
export type { ParsedDocument, SupportedMimeType } from './parsing/index.js';

// ─── Voice Transcription (§19 INPUT) ────────────────────────────────────────
export { transcribeAudio } from './transcription/index.js';
export type { TranscriptionResult, TranscribeOptions } from './transcription/index.js';

// ─── Preference Inference (§20 STRATEGY) ────────────────────────────────────
export { inferPreferences } from './preferences/index.js';
export type { InferredPreference, FeedbackSignal } from './preferences/index.js';

// ─── Analytics Event Catalog ─────────────────────────────────────────────────
export { EVENTS } from './analytics/index.js';
export type { EventName, EventProperties } from './analytics/index.js';

// ─── AI Generation Logging (§21 Plane 3) ────────────────────────────────────
export { createGenerationLog } from './generation-logger.js';
export type { GenerationLogInput, GenerationLogRecord } from './generation-logger.js';

// ─── Tier 1: Identity Tracking (§21) ────────────────────────────────────────
export {
  createUserContext,
  createUserContextFromValues,
  hashApiKey,
  withLangfuseHeaders,
} from './identity/index.js';
export type { RequestLike, UserContext, LangfuseHeaders } from './identity/index.js';

// ─── Ingestion Pipeline (§19 Input Pillar) ───────────────────────────────────
export type {
  IngestResult, IngestOptions, Ingester, ChunkStrategy, SourceType,
  NearDedupResult, JobTypeValue, IngestionJobData, RedisConnectionOptions,
} from './ingestion/index.js';
export {
  computeContentHash, IngesterRegistry,
  DocumentIngester, AudioIngester, ImageIngester, WebIngester, CsvIngester, ApiFeedIngester,
  computeFreshnessMultiplier, isHashDuplicate, cosineSimilarity, NEAR_DEDUP_THRESHOLD,
  chunkFixed, chunkSlidingWindow, chunkPerEntity, chunkSemantic, selectChunker,
  createIngestionQueue, JobType, createIngestionWorker, parseRedisConnection,
} from './ingestion/index.js';
