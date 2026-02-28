/**
 * FILE PURPOSE: Zero-dependency regex scanner for fast heuristic output checks
 *
 * WHY: First line of defense — catches obvious PII, prompt injection markers,
 *      code execution, and SQL injection patterns in sub-millisecond time.
 *      Runs on every output regardless of LlamaGuard availability.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { GuardrailScanner, GuardrailFinding, GuardrailSeverity } from './types.js';

interface PatternRule {
  pattern: RegExp;
  category: string;
  description: string;
  severity: GuardrailSeverity;
}

/** Patterns to detect in LLM output. Each returns a finding if matched. */
const PATTERNS: PatternRule[] = [
  // ─── PII Leakage ─────────────────────────────────────────────
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    category: 'pii_leakage',
    description: 'SSN pattern detected (XXX-XX-XXXX)',
    severity: 'critical',
  },
  {
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/,
    category: 'pii_leakage',
    description: 'Credit card number pattern detected',
    severity: 'critical',
  },
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    category: 'pii_leakage',
    description: 'Email address detected in output',
    severity: 'medium',
  },

  // ─── Prompt Injection Markers ────────────────────────────────
  {
    pattern: /(?:ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions|system\s*:\s*you\s+are|<\|im_start\|>|<\|endoftext\|>|\[INST\]|\[\/INST\])/i,
    category: 'prompt_injection',
    description: 'Prompt injection marker detected in output',
    severity: 'high',
  },

  // ─── Code Execution ──────────────────────────────────────────
  {
    pattern: /\beval\s*\(/,
    category: 'code_execution',
    description: 'eval() call detected in output',
    severity: 'high',
  },
  {
    pattern: /<script[\s>]/i,
    category: 'code_execution',
    description: '<script> tag detected in output',
    severity: 'high',
  },
  {
    pattern: /\bon\w+\s*=\s*["']/i,
    category: 'code_execution',
    description: 'Inline event handler detected (potential XSS)',
    severity: 'medium',
  },

  // ─── SQL Injection ───────────────────────────────────────────
  {
    pattern: /(?:'\s*(?:OR|AND)\s+'[^']*'\s*=\s*'|;\s*DROP\s+TABLE|;\s*DELETE\s+FROM|UNION\s+SELECT)/i,
    category: 'sql_injection',
    description: 'SQL injection pattern detected in output',
    severity: 'high',
  },

  // ─── Secret / Key Leakage ────────────────────────────────────
  {
    pattern: /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9\-_]{20,})/,
    category: 'secret_leakage',
    description: 'API key or secret pattern detected (OpenAI/AWS/GitHub/GitLab)',
    severity: 'critical',
  },
];

export class RegexScanner implements GuardrailScanner {
  readonly name = 'regex';

  async scan(text: string): Promise<GuardrailFinding[]> {
    const findings: GuardrailFinding[] = [];

    for (const rule of PATTERNS) {
      const match = rule.pattern.exec(text);
      if (match) {
        findings.push({
          scanner: this.name,
          category: rule.category,
          description: rule.description,
          severity: rule.severity,
          matchedSnippet: match[0].slice(0, 100), // Truncate long matches
        });
      }
    }

    return findings;
  }
}
