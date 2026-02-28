/**
 * FILE PURPOSE: Barrel export for the output guardrails module
 *
 * WHY: Single import point for guardrail types, scanners, and the scan pipeline.
 *      Import: `import { scanOutput, RegexScanner } from '@playbook/shared-llm'`
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

export { scanOutput } from './scanner.js';
export { RegexScanner } from './regex-scanner.js';
export { LlamaGuardScanner } from './llama-guard-scanner.js';
export type {
  GuardrailSeverity,
  GuardrailFinding,
  GuardrailResult,
  GuardrailScanner,
  ScanConfig,
} from './types.js';
