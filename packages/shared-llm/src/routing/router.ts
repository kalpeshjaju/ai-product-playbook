/**
 * FILE PURPOSE: Application-layer intelligent model routing
 *
 * WHY: Playbook §18 — route queries to the right model tier (fast/balanced/quality)
 *      based on complexity estimation. Saves cost on simple queries while
 *      preserving quality for complex ones. Works alongside LiteLLM's
 *      router_settings for infrastructure-level routing.
 * HOW: Estimates query complexity using heuristics (token count, task type,
 *      explicit tier requests). Maps to model aliases configured in LiteLLM.
 *      Disabled when ROUTELLM_ENABLED is not 'true'.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

/** Model tier — maps to model groups in LiteLLM config. */
export type ModelTier = 'fast' | 'balanced' | 'quality';

/** Configuration for routing decisions. */
export interface RoutingConfig {
  /** Default tier when heuristics are inconclusive */
  defaultTier?: ModelTier;
  /** Force a specific tier (overrides heuristics) */
  forceTier?: ModelTier;
  /** Task type hint for better routing */
  taskType?: string;
  /** Maximum acceptable latency in ms (lower = prefer faster models) */
  maxLatencyMs?: number;
  /** Budget sensitivity (0–1, higher = prefer cheaper models) */
  costSensitivity?: number;
}

/** The routing decision with model selection rationale. */
export interface RoutingDecision {
  /** Selected model tier */
  tier: ModelTier;
  /** Suggested model alias (maps to LiteLLM model_name) */
  model: string;
  /** Estimated query complexity (0–1, higher = more complex) */
  complexity: number;
  /** Why this tier was chosen */
  reason: string;
  /** Whether routing was active or fell through to default */
  active: boolean;
}

/** Model alias mapping per tier — matches LiteLLM config model_name entries. */
const TIER_MODELS: Record<ModelTier, string> = {
  fast: 'gpt-4o-mini',
  balanced: 'claude-haiku',
  quality: 'claude-sonnet',
};

/** Task types that typically need higher-quality models. */
const QUALITY_TASKS = new Set([
  'synthesis', 'analysis', 'code-generation', 'reasoning',
  'creative-writing', 'research', 'evaluation',
]);

/** Task types that work fine with fast models. */
const FAST_TASKS = new Set([
  'classification', 'extraction', 'summarization',
  'translation', 'formatting', 'tagging',
]);

/**
 * Estimate query complexity using lightweight heuristics.
 * Returns a score from 0 (trivial) to 1 (very complex).
 */
function estimateComplexity(query: string, taskType?: string): number {
  let score = 0;
  const wordCount = query.split(/\s+/).length;

  // Length-based estimation
  if (wordCount > 500) score += 0.3;
  else if (wordCount > 200) score += 0.2;
  else if (wordCount > 50) score += 0.1;

  // Task type signals
  if (taskType && QUALITY_TASKS.has(taskType)) score += 0.35;
  if (taskType && FAST_TASKS.has(taskType)) score -= 0.2;

  // Content signals (multi-step instructions, code blocks, technical terms)
  if (/\b(step\s+\d|first.*then.*finally)\b/i.test(query)) score += 0.15;
  if (/```[\s\S]*```/.test(query)) score += 0.1;
  if (/\b(analyze|synthesize|compare|evaluate|architect)\b/i.test(query)) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Route a query to the optimal model tier.
 *
 * When ROUTELLM_ENABLED is not 'true', returns the default tier ('balanced')
 * with active=false — callers can use the suggestion or ignore it.
 *
 * @param query - The user query or prompt to route
 * @param config - Optional routing configuration overrides
 *
 * @example
 * ```typescript
 * import { routeQuery } from '@playbook/shared-llm';
 * const decision = routeQuery('Classify this email as spam or not', { taskType: 'classification' });
 * // { tier: 'fast', model: 'gpt-4o-mini', complexity: 0.1, active: true, ... }
 * const llm = createLLMClient();
 * const res = await llm.chat.completions.create({ model: decision.model, ... });
 * ```
 */
export function routeQuery(query: string, config?: RoutingConfig): RoutingDecision {
  const enabled = process.env.ROUTELLM_ENABLED === 'true';
  const defaultTier = config?.defaultTier ?? 'balanced';

  // Routing disabled — return default
  if (!enabled) {
    return {
      tier: defaultTier,
      model: TIER_MODELS[defaultTier],
      complexity: 0,
      reason: 'RouteLLM disabled (ROUTELLM_ENABLED != true)',
      active: false,
    };
  }

  // Forced tier override
  if (config?.forceTier) {
    return {
      tier: config.forceTier,
      model: TIER_MODELS[config.forceTier],
      complexity: 0,
      reason: `Forced to ${config.forceTier} tier`,
      active: true,
    };
  }

  const complexity = estimateComplexity(query, config?.taskType);
  const costSensitivity = config?.costSensitivity ?? 0.5;

  // Adjust complexity threshold based on cost sensitivity
  // Higher cost sensitivity → lower threshold for downgrading to cheaper model
  const qualityThreshold = 0.6 - (costSensitivity * 0.2); // 0.4–0.6
  const fastThreshold = 0.25 - (costSensitivity * 0.1); // 0.15–0.25

  let tier: ModelTier;
  let reason: string;

  if (complexity >= qualityThreshold) {
    tier = 'quality';
    reason = `High complexity (${complexity.toFixed(2)}) → quality tier`;
  } else if (complexity <= fastThreshold) {
    tier = 'fast';
    reason = `Low complexity (${complexity.toFixed(2)}) → fast tier`;
  } else {
    tier = 'balanced';
    reason = `Medium complexity (${complexity.toFixed(2)}) → balanced tier`;
  }

  // Latency constraint override
  if (config?.maxLatencyMs && config.maxLatencyMs < 2000 && tier === 'quality') {
    tier = 'balanced';
    reason += ` (downgraded: maxLatencyMs=${config.maxLatencyMs})`;
  }

  return {
    tier,
    model: TIER_MODELS[tier],
    complexity,
    reason,
    active: true,
  };
}
