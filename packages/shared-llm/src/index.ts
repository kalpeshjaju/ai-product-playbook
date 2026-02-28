/**
 * FILE PURPOSE: Barrel export for LLM resilience patterns + proxy client
 *
 * WHY: Single import point for all LLM utilities.
 *      Import: `import { createLLMClient, extractJson, costLedger } from '@playbook/shared-llm'`
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
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
