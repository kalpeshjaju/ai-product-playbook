/**
 * FILE PURPOSE: Strategy provider availability policy enforcement
 *
 * WHY: Strategy integrations (Composio/OpenPipe/Memory) often run fail-open in
 *      development, but production needs deterministic behavior when providers
 *      are missing or misconfigured.
 *
 * HOW: Resolves provider mode (`strict` or `open`) from env with safe defaults,
 *      and optionally writes a 503 response in strict mode when a provider is
 *      unavailable.
 *
 * AUTHOR: Codex (GPT-5)
 * LAST UPDATED: 2026-03-02
 */

import type { ServerResponse } from 'node:http';

export type StrategyProvider = 'composio' | 'openpipe' | 'memory';
export type StrategyProviderMode = 'strict' | 'open';

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Resolve provider policy mode from env. Defaults:
 * - production: strict
 * - non-production: open
 */
export function getStrategyProviderMode(): StrategyProviderMode {
  const configured = process.env.STRATEGY_PROVIDER_MODE?.toLowerCase();

  if (configured === 'strict') return 'strict';

  if (configured === 'open') {
    if (isProduction() && process.env.STRATEGY_PROVIDER_ALLOW_OPEN_IN_PRODUCTION !== 'true') {
      process.stdout.write(
        'WARN: STRATEGY_PROVIDER_MODE=open rejected in production — falling back to strict\n',
      );
      return 'strict';
    }
    return 'open';
  }

  return isProduction() ? 'strict' : 'open';
}

/** Check if a specific strategy provider is configured for use. */
export function isStrategyProviderConfigured(provider: StrategyProvider): boolean {
  if (provider === 'composio') {
    return hasValue(process.env.COMPOSIO_API_KEY);
  }

  if (provider === 'openpipe') {
    return hasValue(process.env.OPENPIPE_API_KEY);
  }

  const selectedMemoryProvider = process.env.MEMORY_PROVIDER?.toLowerCase();
  if (selectedMemoryProvider === 'zep') {
    return hasValue(process.env.ZEP_API_KEY);
  }
  if (selectedMemoryProvider === 'mem0') {
    return hasValue(process.env.MEM0_API_KEY);
  }

  return hasValue(process.env.MEM0_API_KEY) || hasValue(process.env.ZEP_API_KEY);
}

function missingConfigMessage(provider: StrategyProvider): string {
  if (provider === 'composio') return 'COMPOSIO_API_KEY not set';
  if (provider === 'openpipe') return 'OPENPIPE_API_KEY not set';

  const selectedMemoryProvider = process.env.MEMORY_PROVIDER?.toLowerCase();
  if (selectedMemoryProvider === 'zep') return 'MEMORY_PROVIDER=zep but ZEP_API_KEY not set';
  if (selectedMemoryProvider === 'mem0') return 'MEMORY_PROVIDER=mem0 but MEM0_API_KEY not set';
  return 'No memory provider configured (set MEM0_API_KEY or ZEP_API_KEY)';
}

/**
 * Enforce strategy provider availability according to policy mode.
 *
 * Returns true when provider is available.
 * Returns false when unavailable. In strict mode, writes 503 response.
 */
export function enforceProviderAvailability(
  provider: StrategyProvider,
  res: ServerResponse,
): boolean {
  if (isStrategyProviderConfigured(provider)) return true;

  const mode = getStrategyProviderMode();
  if (mode === 'strict') {
    res.statusCode = 503;
    res.end(JSON.stringify({
      error: `${provider} provider unavailable in strict mode`,
      provider,
      mode,
      message: missingConfigMessage(provider),
    }));
  }

  return false;
}

/** Public message for open-mode (non-failing) provider unavailability responses. */
export function getProviderUnavailableMessage(provider: StrategyProvider): string {
  return missingConfigMessage(provider);
}
