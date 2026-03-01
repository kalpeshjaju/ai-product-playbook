/**
 * FILE PURPOSE: Type definitions for the output guardrail scanning system
 *
 * WHY: All user-facing LLM output must pass through guardrails (§21).
 *      These types define the scanner interface and result shapes.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

/** Severity of a guardrail finding — determines whether output is blocked. */
export type GuardrailSeverity = 'low' | 'medium' | 'high' | 'critical';

/** A single issue detected by a guardrail scanner. */
export interface GuardrailFinding {
  /** Which scanner produced this finding ('regex' | 'llamaguard'). */
  scanner: string;
  /** Category of the issue (e.g. 'pii_leakage', 'prompt_injection'). */
  category: string;
  /** Human-readable description of what was detected. */
  description: string;
  /** How severe this finding is. */
  severity: GuardrailSeverity;
  /** The matched text snippet, if applicable. */
  matchedSnippet?: string;
}

/** Aggregated result from running one or more guardrail scanners. */
export interface GuardrailResult {
  /** true if no findings at or above the configured minSeverity. */
  passed: boolean;
  /** All findings from all scanners that ran. */
  findings: GuardrailFinding[];
  /** Wall-clock time for the full scan pipeline (ms). */
  scanTimeMs: number;
  /** Names of scanners that were executed. */
  scannersRun: string[];
}

/** Interface that all guardrail scanners implement. */
export interface GuardrailScanner {
  /** Unique name for this scanner (e.g. 'regex', 'llamaguard'). */
  readonly name: string;
  /** Scan the given text and return any findings. */
  scan(text: string): Promise<GuardrailFinding[]>;
}

/** Configuration for the scanOutput() pipeline. */
export interface ScanConfig {
  /** Minimum severity to include in results. Findings below this are filtered out. Default: 'low'. */
  minSeverity?: GuardrailSeverity;
  /** Whether to run the LlamaGuard semantic scanner. Default: true. */
  enableLlamaGuard?: boolean;
  /** Timeout for the LlamaGuard scanner in ms. Default: 5000. */
  llamaGuardTimeoutMs?: number;
  /**
   * Behavior when LlamaGuard is unavailable or errors.
   * - 'open': swallow errors, continue without semantic scan (old behavior).
   * - 'closed': treat scanner failure as a critical finding — output is blocked.
   * Default: 'closed'.
   */
  failureMode?: 'open' | 'closed';
}
