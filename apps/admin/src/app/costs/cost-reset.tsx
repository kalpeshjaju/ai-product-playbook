/**
 * FILE PURPOSE: Client component for cost reset button
 *
 * WHY: Reset action requires user interaction and confirmation.
 * HOW: Calls the local Next.js route handler which proxies to the API with admin key.
 */

'use client';

import { useState, useEffect } from 'react';
import { trackEvent } from '../../hooks/use-analytics';

export function CostReset() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    trackEvent('cost_report_viewed');
  }, []);

  async function handleReset() {
    if (!confirm('Reset all cost tracking data? This cannot be undone.')) return;
    setStatus('loading');
    try {
      const res = await fetch('/costs/reset', { method: 'POST' });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <button
      onClick={handleReset}
      disabled={status === 'loading'}
      className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {status === 'loading' ? 'Resetting...' : status === 'done' ? 'Reset!' : status === 'error' ? 'Failed' : 'Reset Costs'}
    </button>
  );
}
