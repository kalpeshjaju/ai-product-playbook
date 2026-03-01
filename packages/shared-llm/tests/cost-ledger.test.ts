import { describe, it, expect, beforeEach } from 'vitest';
import { costLedger, CostLimitExceededError } from '../src/cost-ledger.js';

describe('CostLedger', () => {
  beforeEach(() => {
    costLedger.reset();
  });

  it('tracks total cost from recordCall with correct pricing math', () => {
    // claude-sonnet: $3.00/1M input, $15.00/1M output
    costLedger.recordCall('agent-a', 'claude-sonnet-4-6-20250218', 1_000_000, 100_000, 1200, true);
    const report = costLedger.getReport();
    // input cost: 1M * 3.00/1M = $3.00
    // output cost: 100K * 15.00/1M = $1.50
    expect(report.totalCostUSD).toBeCloseTo(4.5, 2);
    expect(report.totalInputTokens).toBe(1_000_000);
    expect(report.totalOutputTokens).toBe(100_000);
    expect(report.currency).toBe('USD');
  });

  it('uses default pricing for unknown models', () => {
    // default: $3.00/1M input, $15.00/1M output
    costLedger.recordCall('agent-b', 'some-unknown-model', 1_000_000, 0, 500, true);
    const report = costLedger.getReport();
    expect(report.totalCostUSD).toBeCloseTo(3.0, 2);
  });

  it('tracks per-agent usage in byAgent', () => {
    costLedger.recordCall('agent-a', 'gpt-4o-mini', 500, 100, 200, true);
    costLedger.recordCall('agent-b', 'gpt-4o', 1000, 200, 300, true);
    const report = costLedger.getReport();
    expect(report.byAgent['agent-a']).toBeDefined();
    expect(report.byAgent['agent-b']).toBeDefined();
    expect(report.byAgent['agent-a']!.model).toBe('gpt-4o-mini');
    expect(report.byAgent['agent-b']!.model).toBe('gpt-4o');
  });

  it('throws CostLimitExceededError when budget exceeded via ensureBudget()', () => {
    // Default budget is $10. Record a call worth more than $10.
    costLedger.recordCall('agent-a', 'claude-opus-4-6-20250205', 1_000_000, 1_000_000, 5000, true);
    // opus: $15/1M input + $75/1M output = $90 total — well over $10 budget
    expect(() => costLedger.ensureBudget()).toThrow(CostLimitExceededError);
  });

  it('CostLimitExceededError has correct name and message format', () => {
    costLedger.recordCall('agent-a', 'claude-opus-4-6-20250205', 1_000_000, 1_000_000, 5000, true);
    try {
      costLedger.ensureBudget();
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CostLimitExceededError);
      expect((e as Error).name).toBe('CostLimitExceededError');
      expect((e as Error).message).toContain('Cost limit exceeded');
      expect((e as Error).message).toContain('Limit: $10.00');
    }
  });

  it('getObservabilityReport includes detailed agent stats', () => {
    costLedger.recordCall('agent-a', 'gpt-4o', 500, 100, 200, true);
    costLedger.recordCall('agent-a', 'gpt-4o', 300, 50, 100, false);
    const report = costLedger.getObservabilityReport();
    expect(report.totalCalls).toBe(2);
    expect(report.totalSuccesses).toBe(1);
    expect(report.totalFailures).toBe(1);
    expect(report.overallErrorRate).toBeCloseTo(0.5, 2);
    const agentStats = report.byAgentDetailed['agent-a'];
    expect(agentStats).toBeDefined();
    expect(agentStats!.callCount).toBe(2);
    expect(agentStats!.successCount).toBe(1);
    expect(agentStats!.failCount).toBe(1);
    expect(agentStats!.avgLatencyMs).toBe(150);
  });

  it('reset clears all tracked data', () => {
    costLedger.recordCall('agent-a', 'gpt-4o', 500, 100, 200, true);
    costLedger.reset();
    const report = costLedger.getReport();
    expect(report.totalCostUSD).toBe(0);
    expect(report.totalInputTokens).toBe(0);
    expect(report.totalOutputTokens).toBe(0);
    expect(Object.keys(report.byAgent)).toHaveLength(0);
  });

  it('getRemainingBudget and getBudgetUtilization are consistent', () => {
    expect(costLedger.getRemainingBudget()).toBe(10);
    expect(costLedger.getBudgetUtilization()).toBe(0);
    // Use ~$3 of the $10 budget
    costLedger.recordCall('agent-a', 'claude-sonnet-4-6-20250218', 1_000_000, 0, 100, true);
    expect(costLedger.getRemainingBudget()).toBeCloseTo(7, 0);
    expect(costLedger.getBudgetUtilization()).toBeCloseTo(30, 0);
  });
});
