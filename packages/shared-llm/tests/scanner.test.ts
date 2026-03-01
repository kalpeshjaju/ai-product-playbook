import { describe, it, expect, vi } from 'vitest';
import { scanOutput } from '../src/guardrails/scanner.js';

// Mock the LlamaGuard scanner to control behavior per test
const mockScan = vi.fn().mockResolvedValue([]);

vi.mock('../src/guardrails/llama-guard-scanner.js', () => ({
  LlamaGuardScanner: class {
    readonly name = 'llamaguard';
    scan = mockScan;
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
    mockScan.mockResolvedValueOnce([]);
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

  describe('failureMode', () => {
    it('fail-closed (default): blocks output when LlamaGuard errors', async () => {
      mockScan.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await scanOutput('Safe text', { enableLlamaGuard: true });
      expect(result.passed).toBe(false);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.category).toBe('guardrail_unavailable');
      expect(result.findings[0]!.severity).toBe('critical');
      expect(result.findings[0]!.description).toContain('Connection refused');
      expect(result.scannersRun).toContain('llamaguard');
    });

    it('fail-closed: explicitly set', async () => {
      mockScan.mockRejectedValueOnce(new Error('Timeout'));
      const result = await scanOutput('Safe text', {
        enableLlamaGuard: true,
        failureMode: 'closed',
      });
      expect(result.passed).toBe(false);
      expect(result.findings[0]!.category).toBe('guardrail_unavailable');
    });

    it('fail-open: passes output when LlamaGuard errors', async () => {
      mockScan.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await scanOutput('Safe text', {
        enableLlamaGuard: true,
        failureMode: 'open',
      });
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(result.scannersRun).toContain('llamaguard');
    });

    it('fail-open: regex findings still reported even when LlamaGuard errors', async () => {
      mockScan.mockRejectedValueOnce(new Error('Service unavailable'));
      const result = await scanOutput('SSN: 123-45-6789', {
        enableLlamaGuard: true,
        failureMode: 'open',
      });
      expect(result.passed).toBe(false);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings.every(f => f.scanner === 'regex')).toBe(true);
    });
  });
});
