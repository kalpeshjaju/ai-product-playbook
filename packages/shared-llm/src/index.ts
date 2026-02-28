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
