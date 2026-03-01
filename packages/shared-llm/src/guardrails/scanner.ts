/**
 * FILE PURPOSE: Compose guardrail scanners into a single scan pipeline
 *
 * WHY: scanOutput() is the main entry point for all output guardrail checks.
 *      It runs regex (fast, always on) then optionally LlamaGuard (semantic).
 *      Returns a unified GuardrailResult with pass/fail and all findings.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { GuardrailResult, GuardrailFinding, GuardrailSeverity, ScanConfig } from './types.js';
import { RegexScanner } from './regex-scanner.js';
import { LlamaGuardScanner } from './llama-guard-scanner.js';

const SEVERITY_ORDER: Record<GuardrailSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Scan LLM output through guardrail scanners.
 *
 * Regex scanner always runs (zero deps, sub-ms).
 * LlamaGuard scanner runs when enabled (default: true).
 * Failure mode (default: 'closed') controls behavior when LlamaGuard errors.
 *
 * @param text - The LLM-generated text to scan
 * @param config - Optional scan configuration
 * @returns Unified result with pass/fail and all findings
 */
export async function scanOutput(text: string, config?: ScanConfig): Promise<GuardrailResult> {
  const minSeverity = config?.minSeverity ?? 'low';
  const enableLlamaGuard = config?.enableLlamaGuard ?? true;
  const llamaGuardTimeoutMs = config?.llamaGuardTimeoutMs ?? 5000;
  const failureMode = config?.failureMode ?? 'closed';

  const start = Date.now();
  const allFindings: GuardrailFinding[] = [];
  const scannersRun: string[] = [];

  // Always run regex scanner (zero deps, sub-ms)
  const regexScanner = new RegexScanner();
  const regexFindings = await regexScanner.scan(text);
  allFindings.push(...regexFindings);
  scannersRun.push(regexScanner.name);

  // Optionally run LlamaGuard semantic scanner
  if (enableLlamaGuard) {
    const llamaGuardScanner = new LlamaGuardScanner({ timeoutMs: llamaGuardTimeoutMs });
    try {
      const llamaFindings = await llamaGuardScanner.scan(text);
      allFindings.push(...llamaFindings);
    } catch (err) {
      if (failureMode === 'closed') {
        // Fail-closed: scanner error → block output with critical finding
        allFindings.push({
          scanner: llamaGuardScanner.name,
          category: 'guardrail_unavailable',
          description: `LlamaGuard scanner unavailable — output blocked (fail-closed). ${err instanceof Error ? err.message : String(err)}`,
          severity: 'critical',
        });
      }
      // Fail-open: swallow error, continue without semantic scan
    }
    scannersRun.push(llamaGuardScanner.name);
  }

  // Filter by minimum severity
  const minLevel = SEVERITY_ORDER[minSeverity];
  const filteredFindings = allFindings.filter(
    f => SEVERITY_ORDER[f.severity] >= minLevel,
  );

  return {
    passed: filteredFindings.length === 0,
    findings: filteredFindings,
    scanTimeMs: Date.now() - start,
    scannersRun,
  };
}
