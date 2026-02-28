/**
 * FILE PURPOSE: Agent memory provider interface + shared types
 *
 * WHY: Playbook §20 — agent memory is provider-agnostic. App code calls the
 *      AgentMemoryProvider interface; the concrete backend (Mem0, Zep) is
 *      selected by the MEMORY_PROVIDER env var via the factory.
 * HOW: Defines a minimal CRUD + search interface that both Mem0 and Zep can
 *      implement without leaking provider-specific abstractions.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

/** A single memory entry stored by the provider. */
export interface MemoryEntry {
  /** Provider-assigned unique ID */
  id: string;
  /** The memory content (text) */
  content: string;
  /** User or agent ID that owns this memory */
  userId: string;
  /** Optional agent/session scope */
  agentId?: string;
  /** Arbitrary metadata (tags, source, etc.) */
  metadata?: Record<string, string | number | boolean>;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** ISO 8601 timestamp */
  updatedAt?: string;
}

/** A memory search result with relevance score. */
export interface MemorySearchResult {
  entry: MemoryEntry;
  /** Relevance score (0–1, higher = more relevant) */
  score: number;
}

/** Options for adding a new memory. */
export interface AddMemoryOptions {
  userId: string;
  agentId?: string;
  metadata?: Record<string, string | number | boolean>;
}

/** Options for searching memories. */
export interface SearchMemoryOptions {
  userId: string;
  agentId?: string;
  /** Maximum results to return */
  limit?: number;
}

/**
 * Abstract memory provider interface.
 * Implementations: Mem0Provider, ZepProvider.
 */
export interface AgentMemoryProvider {
  /** Provider name for logging/debugging */
  readonly name: string;

  /** Add a memory for a user/agent. Returns the created entry ID. */
  add(content: string, options: AddMemoryOptions): Promise<string>;

  /** Search memories by semantic similarity. */
  search(query: string, options: SearchMemoryOptions): Promise<MemorySearchResult[]>;

  /** Get all memories for a user/agent. */
  getAll(userId: string, agentId?: string): Promise<MemoryEntry[]>;

  /** Delete a specific memory by ID. */
  delete(memoryId: string): Promise<void>;
}
