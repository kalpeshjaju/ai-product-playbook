/**
 * FILE PURPOSE: Factory for creating the active memory provider
 *
 * WHY: App code doesn't need to know which memory backend is configured.
 *      Call createMemoryProvider() and get the right implementation.
 * HOW: Reads MEMORY_PROVIDER env var ("mem0" | "zep"), defaults to mem0.
 *      Returns a concrete AgentMemoryProvider instance.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import type { AgentMemoryProvider } from './types.js';
import { Mem0Provider } from './mem0-provider.js';
import { ZepProvider } from './zep-provider.js';

type ProviderName = 'mem0' | 'zep';

/**
 * Create an AgentMemoryProvider based on configuration.
 *
 * @param provider - Override the MEMORY_PROVIDER env var (useful for testing)
 * @returns A configured AgentMemoryProvider instance
 *
 * @example
 * ```typescript
 * import { createMemoryProvider } from '@playbook/shared-llm';
 * const memory = createMemoryProvider();
 * await memory.add('User prefers dark mode', { userId: 'user-123' });
 * const results = await memory.search('theme preference', { userId: 'user-123' });
 * ```
 */
export function createMemoryProvider(provider?: ProviderName): AgentMemoryProvider {
  const selected = provider ?? (process.env.MEMORY_PROVIDER as ProviderName | undefined) ?? 'mem0';

  switch (selected) {
    case 'zep':
      return new ZepProvider();
    case 'mem0':
    default:
      return new Mem0Provider();
  }
}
