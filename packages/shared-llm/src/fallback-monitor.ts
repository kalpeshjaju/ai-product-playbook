/**
 * FILE PURPOSE: Track fallback invocation rates to detect silent degradation
 *
 * WHY: Resilience patterns (JSON repair, template fallback, default values)
 *      hide failures from users — but they also hide degradation from operators.
 *      If your JSON repair strategy 4 fires 50% of the time, your prompts are
 *      broken. Without monitoring, you'd never know.
 * HOW: Counter per feature tracks primary vs fallback invocations. Alert thresholds
 *      at 10% (warn), 30% (page), 50% (rollback).
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

// ============================================================================
// Types
// ============================================================================

export interface FallbackEvent {
  feature: string;
  reason: string;
  timestamp: number;
}

export interface FallbackStats {
  feature: string;
  primaryCount: number;
  fallbackCount: number;
  fallbackRate: number;
  recentFallbacks: FallbackEvent[];
}

export type AlertLevel = 'ok' | 'warn' | 'page' | 'rollback';

// ============================================================================
// FallbackMonitor
// ============================================================================

/**
 * Monitor fallback invocation rates per feature.
 *
 * WHY: Every fallback that fires is a signal. Low rate = healthy resilience.
 *      High rate = broken primary path hiding behind fallback.
 *
 * EXAMPLE:
 * ```typescript
 * const monitor = new FallbackMonitor();
 *
 * // In your code paths:
 * try {
 *   const result = await primaryPath();
 *   monitor.recordPrimary('json-extraction');
 * } catch {
 *   const result = fallbackPath();
 *   monitor.recordFallback('json-extraction', 'JSON.parse failed');
 * }
 *
 * // In your monitoring dashboard:
 * const stats = monitor.getStats('json-extraction');
 * // { fallbackRate: 0.12, primaryCount: 88, fallbackCount: 12 }
 * ```
 */
export class FallbackMonitor {
  private counters: Map<string, { primary: number; fallback: number }> = new Map();
  private recentFallbacks: Map<string, FallbackEvent[]> = new Map();
  private readonly maxRecentEvents: number;

  constructor(maxRecentEvents = 50) {
    this.maxRecentEvents = maxRecentEvents;
  }

  /**
   * Record a successful primary path execution.
   */
  recordPrimary(feature: string): void {
    const c = this.counters.get(feature) || { primary: 0, fallback: 0 };
    c.primary++;
    this.counters.set(feature, c);
  }

  /**
   * Record a fallback invocation with reason.
   */
  recordFallback(feature: string, reason: string): void {
    const c = this.counters.get(feature) || { primary: 0, fallback: 0 };
    c.fallback++;
    this.counters.set(feature, c);

    // Store recent fallback event
    const events = this.recentFallbacks.get(feature) || [];
    events.push({ feature, reason, timestamp: Date.now() });
    if (events.length > this.maxRecentEvents) events.shift();
    this.recentFallbacks.set(feature, events);
  }

  /**
   * Get fallback rate for a specific feature.
   * Returns 0 if no data exists.
   */
  getFallbackRate(feature: string): number {
    const c = this.counters.get(feature);
    if (!c || (c.primary + c.fallback) === 0) return 0;
    return c.fallback / (c.primary + c.fallback);
  }

  /**
   * Get full stats for a feature.
   */
  getStats(feature: string): FallbackStats {
    const c = this.counters.get(feature) || { primary: 0, fallback: 0 };
    const total = c.primary + c.fallback;
    return {
      feature,
      primaryCount: c.primary,
      fallbackCount: c.fallback,
      fallbackRate: total > 0 ? c.fallback / total : 0,
      recentFallbacks: this.recentFallbacks.get(feature) || [],
    };
  }

  /**
   * Get alert level based on fallback rate thresholds.
   *
   * - ok:       < 10% fallback rate (healthy)
   * - warn:     10-30% (log warning, investigate prompts)
   * - page:     30-50% (page on-call, prompt is degraded)
   * - rollback: > 50% (primary path is broken, rollback prompt change)
   */
  getAlertLevel(feature: string): AlertLevel {
    const rate = this.getFallbackRate(feature);
    if (rate >= 0.50) return 'rollback';
    if (rate >= 0.30) return 'page';
    if (rate >= 0.10) return 'warn';
    return 'ok';
  }

  /**
   * Get all features and their current status.
   */
  getAllStats(): FallbackStats[] {
    const stats: FallbackStats[] = [];
    for (const feature of this.counters.keys()) {
      stats.push(this.getStats(feature));
    }
    return stats.sort((a, b) => b.fallbackRate - a.fallbackRate);
  }

  /**
   * Reset all counters. Useful for per-run or per-window tracking.
   */
  reset(): void {
    this.counters.clear();
    this.recentFallbacks.clear();
  }
}

// Global singleton
export const fallbackMonitor = new FallbackMonitor();
