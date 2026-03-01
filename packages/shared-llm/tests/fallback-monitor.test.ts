import { describe, it, expect, beforeEach } from 'vitest';
import { FallbackMonitor } from '../src/fallback-monitor.js';

describe('FallbackMonitor', () => {
  let monitor: FallbackMonitor;

  beforeEach(() => {
    monitor = new FallbackMonitor();
  });

  it('tracks primary and fallback invocations separately', () => {
    monitor.recordPrimary('json-extraction');
    monitor.recordPrimary('json-extraction');
    monitor.recordFallback('json-extraction', 'parse failed');
    const stats = monitor.getStats('json-extraction');
    expect(stats.primaryCount).toBe(2);
    expect(stats.fallbackCount).toBe(1);
  });

  it('calculates fallback rate correctly', () => {
    for (let i = 0; i < 8; i++) monitor.recordPrimary('feature-a');
    for (let i = 0; i < 2; i++) monitor.recordFallback('feature-a', 'timeout');
    expect(monitor.getFallbackRate('feature-a')).toBeCloseTo(0.2, 2);
  });

  it('returns 0 fallback rate for unknown features', () => {
    expect(monitor.getFallbackRate('nonexistent')).toBe(0);
  });

  it('returns correct alert levels at thresholds', () => {
    // < 10% → ok
    for (let i = 0; i < 95; i++) monitor.recordPrimary('ok-feature');
    for (let i = 0; i < 5; i++) monitor.recordFallback('ok-feature', 'reason');
    expect(monitor.getAlertLevel('ok-feature')).toBe('ok');

    // 10-30% → warn
    const warnMonitor = new FallbackMonitor();
    for (let i = 0; i < 80; i++) warnMonitor.recordPrimary('warn-feature');
    for (let i = 0; i < 20; i++) warnMonitor.recordFallback('warn-feature', 'reason');
    expect(warnMonitor.getAlertLevel('warn-feature')).toBe('warn');

    // 30-50% → page
    const pageMonitor = new FallbackMonitor();
    for (let i = 0; i < 60; i++) pageMonitor.recordPrimary('page-feature');
    for (let i = 0; i < 40; i++) pageMonitor.recordFallback('page-feature', 'reason');
    expect(pageMonitor.getAlertLevel('page-feature')).toBe('page');

    // >= 50% → rollback
    const rollbackMonitor = new FallbackMonitor();
    for (let i = 0; i < 50; i++) rollbackMonitor.recordPrimary('roll-feature');
    for (let i = 0; i < 50; i++) rollbackMonitor.recordFallback('roll-feature', 'reason');
    expect(rollbackMonitor.getAlertLevel('roll-feature')).toBe('rollback');
  });

  it('stores recent fallback events with ring buffer', () => {
    const small = new FallbackMonitor(3); // maxRecentEvents=3
    small.recordFallback('feat', 'reason-1');
    small.recordFallback('feat', 'reason-2');
    small.recordFallback('feat', 'reason-3');
    small.recordFallback('feat', 'reason-4');
    const stats = small.getStats('feat');
    expect(stats.recentFallbacks).toHaveLength(3);
    expect(stats.recentFallbacks[0]!.reason).toBe('reason-2'); // oldest evicted
  });

  it('getAllStats returns features sorted by fallback rate descending', () => {
    monitor.recordFallback('high', 'reason');
    monitor.recordPrimary('low');
    monitor.recordPrimary('low');
    monitor.recordFallback('low', 'reason');
    const all = monitor.getAllStats();
    expect(all[0]!.feature).toBe('high'); // 100% rate
    expect(all[1]!.feature).toBe('low');  // 33% rate
  });

  it('reset clears all data', () => {
    monitor.recordPrimary('feat');
    monitor.recordFallback('feat', 'reason');
    monitor.reset();
    expect(monitor.getFallbackRate('feat')).toBe(0);
    expect(monitor.getAllStats()).toHaveLength(0);
  });
});
