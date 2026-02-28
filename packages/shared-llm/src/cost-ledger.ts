/**
 * FILE PURPOSE: Provider-layer cost tracking with per-agent attribution and budget enforcement
 *
 * WHY: Records every LLM API call for billing truth — captures retries,
 *      fallbacks, and actual model used after routing. Provides hard budget
 *      cap to prevent runaway costs.
 * HOW: Singleton ledger tracks token usage, latency, and error rates per agent.
 *      Budget enforcement throws on exceed.
 *
 * LAYER: Provider (billing truth). Pair with LLMMonitor for agent-layer attribution.
 *
 * ADAPTED FROM: ui-ux-audit-tool/src/v4/infra/cost/cost-ledger.ts
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

// ============================================================================
// Types
// ============================================================================

export interface TokenUsage {
  input: number;
  output: number;
  costUSD: number;
  model: string;
}

export interface CostReport {
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byAgent: Record<string, TokenUsage>;
  currency: 'USD';
}

export interface LLMCallRecord {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  timestamp: number;
}

export interface AgentObservability {
  callCount: number;
  successCount: number;
  failCount: number;
  errorRate: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  tokenUsage: TokenUsage;
  recentCalls: LLMCallRecord[];
}

export interface ObservabilityReport extends CostReport {
  byAgentDetailed: Record<string, AgentObservability>;
  totalCalls: number;
  totalSuccesses: number;
  totalFailures: number;
  overallErrorRate: number;
  overallAvgLatencyMs: number;
}

// ============================================================================
// Pricing (update when models change)
// ============================================================================

const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic (per 1M tokens)
  'claude-sonnet-4-6-20250218': { input: 3.00, output: 15.00 },
  'claude-opus-4-6-20250205': { input: 15.00, output: 75.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  // Together AI / OSS
  'deepseek-v3': { input: 0.15, output: 0.60 },
  // Fallback
  'default': { input: 3.00, output: 15.00 },
};

const MAX_RECENT_CALLS_PER_AGENT = 100;

// ============================================================================
// CostLedger
// ============================================================================

export class CostLimitExceededError extends Error {
  constructor(currentCost: number, limit: number) {
    super(`Cost limit exceeded: $${currentCost.toFixed(4)} (Limit: $${limit.toFixed(2)})`);
    this.name = 'CostLimitExceededError';
  }
}

/**
 * Provider-layer cost ledger — tracks every LLM API call.
 *
 * WHY: Billing truth. Captures retries, fallbacks, actual model after routing.
 * HOW: Singleton pattern. Records usage per agent with budget enforcement.
 *
 * EXAMPLE:
 * ```typescript
 * const ledger = CostLedger.getInstance();
 * ledger.recordCall('synthesis', 'claude-sonnet-4-6-20250218', 500, 200, 1200, true);
 * const report = ledger.getReport();
 * // { totalCostUSD: 0.0045, byAgent: { synthesis: { ... } } }
 * ```
 *
 * EDGE CASES:
 * - Unknown model → uses default pricing (fail-expensive, not fail-silent)
 * - Budget exceeded → throws CostLimitExceededError
 * - reset() available for per-run tracking
 */
export class CostLedger {
  private static instance: CostLedger;
  private usages: Map<string, TokenUsage> = new Map();
  private callRecords: Map<string, LLMCallRecord[]> = new Map();
  private callCounts: Map<string, { total: number; success: number; fail: number; totalLatencyMs: number }> = new Map();
  private totalInput = 0;
  private totalOutput = 0;
  private totalCost = 0;
  private totalCalls = 0;
  private totalSuccesses = 0;
  private totalFailures = 0;
  private totalLatencyMs = 0;
  private readonly MAX_BUDGET_USD: number;

  private constructor(maxBudgetUSD?: number) {
    this.MAX_BUDGET_USD = maxBudgetUSD ?? parseFloat(process.env.MAX_COST || '10.00');
  }

  public static getInstance(maxBudgetUSD?: number): CostLedger {
    if (!CostLedger.instance) {
      CostLedger.instance = new CostLedger(maxBudgetUSD);
    }
    return CostLedger.instance;
  }

  /**
   * Check if budget is within limits. Throws if exceeded.
   */
  public ensureBudget(): void {
    if (this.totalCost >= this.MAX_BUDGET_USD) {
      throw new CostLimitExceededError(this.totalCost, this.MAX_BUDGET_USD);
    }
  }

  public getRemainingBudget(): number {
    return Math.max(0, this.MAX_BUDGET_USD - this.totalCost);
  }

  public getBudgetUtilization(): number {
    if (this.MAX_BUDGET_USD <= 0) return 100;
    return Math.min(100, (this.totalCost / this.MAX_BUDGET_USD) * 100);
  }

  /**
   * Record a complete LLM API call with tokens, latency, and success/failure.
   */
  public recordCall(
    agentName: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    latencyMs: number,
    success: boolean
  ): void {
    const pricing = PRICING[model] ?? PRICING['default']!;
    const costUSD = (inputTokens / 1_000_000) * pricing.input
                  + (outputTokens / 1_000_000) * pricing.output;

    this.totalInput += inputTokens;
    this.totalOutput += outputTokens;
    this.totalCost += costUSD;
    this.totalCalls++;
    this.totalLatencyMs += latencyMs;

    if (success) {
      this.totalSuccesses++;
    } else {
      this.totalFailures++;
    }

    // Per-agent token tracking
    const current = this.usages.get(agentName) || { input: 0, output: 0, costUSD: 0, model };
    this.usages.set(agentName, {
      input: current.input + inputTokens,
      output: current.output + outputTokens,
      costUSD: current.costUSD + costUSD,
      model,
    });

    // Per-agent call counts
    const counts = this.callCounts.get(agentName) || { total: 0, success: 0, fail: 0, totalLatencyMs: 0 };
    counts.total++;
    counts.totalLatencyMs += latencyMs;
    if (success) counts.success++;
    else counts.fail++;
    this.callCounts.set(agentName, counts);

    // Recent call records (capped per agent)
    const record: LLMCallRecord = {
      agent: agentName, model, inputTokens, outputTokens,
      latencyMs, success, timestamp: Date.now(),
    };
    const records = this.callRecords.get(agentName) || [];
    records.push(record);
    if (records.length > MAX_RECENT_CALLS_PER_AGENT) records.shift();
    this.callRecords.set(agentName, records);
  }

  /**
   * Cost-only report (backward compatible).
   */
  public getReport(): CostReport {
    return {
      totalCostUSD: Number(this.totalCost.toFixed(4)),
      totalInputTokens: this.totalInput,
      totalOutputTokens: this.totalOutput,
      byAgent: Object.fromEntries(this.usages),
      currency: 'USD',
    };
  }

  /**
   * Full observability report with latency, error rates, and per-call details.
   */
  public getObservabilityReport(): ObservabilityReport {
    const byAgentDetailed: Record<string, AgentObservability> = {};

    for (const [agentName, counts] of this.callCounts.entries()) {
      const tokenUsage = this.usages.get(agentName) || { input: 0, output: 0, costUSD: 0, model: 'unknown' };
      const records = this.callRecords.get(agentName) || [];
      const latencies = records.filter(r => r.latencyMs > 0).map(r => r.latencyMs).sort((a, b) => a - b);

      byAgentDetailed[agentName] = {
        callCount: counts.total,
        successCount: counts.success,
        failCount: counts.fail,
        errorRate: counts.total > 0 ? counts.fail / counts.total : 0,
        totalLatencyMs: counts.totalLatencyMs,
        avgLatencyMs: counts.total > 0 ? Math.round(counts.totalLatencyMs / counts.total) : 0,
        p95LatencyMs: latencies.length > 0 ? (latencies[Math.floor(latencies.length * 0.95)] ?? 0) : 0,
        tokenUsage,
        recentCalls: records.slice(-10),
      };
    }

    return {
      ...this.getReport(),
      byAgentDetailed,
      totalCalls: this.totalCalls,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      overallErrorRate: this.totalCalls > 0 ? this.totalFailures / this.totalCalls : 0,
      overallAvgLatencyMs: this.totalCalls > 0 ? Math.round(this.totalLatencyMs / this.totalCalls) : 0,
    };
  }

  public reset(): void {
    this.usages.clear();
    this.callRecords.clear();
    this.callCounts.clear();
    this.totalInput = 0;
    this.totalOutput = 0;
    this.totalCost = 0;
    this.totalCalls = 0;
    this.totalSuccesses = 0;
    this.totalFailures = 0;
    this.totalLatencyMs = 0;
  }
}

export const costLedger = CostLedger.getInstance();
