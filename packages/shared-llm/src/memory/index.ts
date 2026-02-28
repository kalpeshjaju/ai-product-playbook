/**
 * FILE PURPOSE: Barrel export for agent memory layer
 *
 * WHY: Single import point for memory types, providers, and factory.
 *      Import: `import { createMemoryProvider } from '@playbook/shared-llm'`
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

export { createMemoryProvider } from './factory.js';
export { Mem0Provider } from './mem0-provider.js';
export { ZepProvider } from './zep-provider.js';
export type {
  AgentMemoryProvider,
  MemoryEntry,
  MemorySearchResult,
  AddMemoryOptions,
  SearchMemoryOptions,
} from './types.js';
