import { describe, it, expect, vi } from 'vitest';
import { scanOutput } from '../src/guardrails/scanner.js';

// Mock the LlamaGuard scanner to avoid network calls
vi.mock('../src/guardrails/llama-guard-scanner.js', () => ({
  LlamaGuardScanner: class {
    readonly name = 'llamaguard';
    async scan(_text: string) {
      return [];
    }
  },
}));

describe('scanOutput', () => {
  it('passes clean text with no findings', async () => {
    const result = await scanOutput('This is safe output about data analysis.', {
      enableLlamaGuard: false,
    });
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.scannersRun).toContain('regex');
  });

  it('fails on text with PII (regex scanner)', async () => {
    const result = await scanOutput('SSN: 123-45-6789', { enableLlamaGuard: false });
    expect(result.passed).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.category).toBe('pii_leakage');
  });

  it('runs both regex and llamaguard when enableLlamaGuard is true', async () => {
    const result = await scanOutput('Safe text', { enableLlamaGuard: true });
    expect(result.scannersRun).toContain('regex');
    expect(result.scannersRun).toContain('llamaguard');
  });

  it('filters findings by minimum severity', async () => {
    // Email detection is 'medium' severity
    const resultLow = await scanOutput('Contact: test@example.com', {
      enableLlamaGuard: false,
      minSeverity: 'low',
    });
    expect(resultLow.findings.length).toBeGreaterThan(0);

    const resultHigh = await scanOutput('Contact: test@example.com', {
      enableLlamaGuard: false,
      minSeverity: 'high',
    });
    // Email is medium severity, should be filtered out when minSeverity is high
    expect(resultHigh.findings).toHaveLength(0);
    expect(resultHigh.passed).toBe(true);
  });

  it('includes scanTimeMs in the result', async () => {
    const result = await scanOutput('test', { enableLlamaGuard: false });
    expect(typeof result.scanTimeMs).toBe('number');
    expect(result.scanTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('detects multiple findings in a single scan', async () => {
    const text = 'SSN: 123-45-6789, email: admin@corp.com, key: sk-aaaabbbbccccddddeeeeffffgggghhhh';
    const result = await scanOutput(text, { enableLlamaGuard: false });
    expect(result.passed).toBe(false);
    // SSN (critical) + email (medium) + secret key (critical)
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
  });
});
