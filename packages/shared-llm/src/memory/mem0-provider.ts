/**
 * FILE PURPOSE: Mem0 implementation of AgentMemoryProvider
 *
 * WHY: Mem0 provides preference graphs — learns user patterns over time.
 *      Best for: long-term user preference tracking, personalization.
 * HOW: Wraps the mem0ai SDK. Fail-open when MEM0_API_KEY not set.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import type {
  AgentMemoryProvider,
  MemoryEntry,
  MemorySearchResult,
  AddMemoryOptions,
  SearchMemoryOptions,
} from './types.js';

/** Raw response shape from Mem0 SDK add() */
interface Mem0AddResponse {
  id?: string;
  results?: Array<{ id: string }>;
}

/** Raw response shape from Mem0 SDK search() */
interface Mem0SearchResponse {
  results?: Array<{
    id: string;
    memory: string;
    score: number;
    user_id: string;
    agent_id?: string;
    metadata?: Record<string, string | number | boolean>;
    created_at?: string;
    updated_at?: string;
  }>;
}

/** Raw memory shape from Mem0 SDK getAll() */
interface Mem0Memory {
  id: string;
  memory: string;
  user_id: string;
  agent_id?: string;
  metadata?: Record<string, string | number | boolean>;
  created_at?: string;
  updated_at?: string;
}

export class Mem0Provider implements AgentMemoryProvider {
  readonly name = 'mem0';
  private client: unknown;

  constructor() {
    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey) {
      process.stderr.write('INFO: MEM0_API_KEY not set — Mem0 provider will return empty results\n');
      return;
    }

    // Dynamic import would be ideal but we keep it sync for constructor.
    // The mem0ai package exports a MemoryClient class.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MemoryClient } = require('mem0ai') as { MemoryClient: new (config: Record<string, string>) => unknown };
      const config: Record<string, string> = { api_key: apiKey };
      const orgId = process.env.MEM0_ORG_ID;
      if (orgId) config.org_id = orgId;
      this.client = new MemoryClient(config);
    } catch {
      process.stderr.write('WARN: Failed to initialize mem0ai — is the package installed?\n');
    }
  }

  async add(content: string, options: AddMemoryOptions): Promise<string> {
    if (!this.client) return 'noop';
    try {
      const result = await (this.client as { add: (msgs: unknown[], opts: Record<string, string | undefined>) => Promise<Mem0AddResponse> }).add(
        [{ role: 'user', content }],
        { user_id: options.userId, agent_id: options.agentId },
      );
      return result?.results?.[0]?.id ?? result?.id ?? 'unknown';
    } catch (err) {
      process.stderr.write(`WARN: Mem0 add failed: ${err instanceof Error ? err.message : String(err)}\n`);
      return 'error';
    }
  }

  async search(query: string, options: SearchMemoryOptions): Promise<MemorySearchResult[]> {
    if (!this.client) return [];
    try {
      const result = await (this.client as { search: (q: string, opts: Record<string, string | number | undefined>) => Promise<Mem0SearchResponse> }).search(
        query,
        { user_id: options.userId, agent_id: options.agentId, limit: options.limit ?? 10 },
      );
      return (result?.results ?? []).map((r) => ({
        entry: {
          id: r.id,
          content: r.memory,
          userId: r.user_id,
          agentId: r.agent_id,
          metadata: r.metadata,
          createdAt: r.created_at ?? new Date().toISOString(),
          updatedAt: r.updated_at,
        },
        score: r.score,
      }));
    } catch (err) {
      process.stderr.write(`WARN: Mem0 search failed: ${err instanceof Error ? err.message : String(err)}\n`);
      return [];
    }
  }

  async getAll(userId: string, agentId?: string): Promise<MemoryEntry[]> {
    if (!this.client) return [];
    try {
      const result = await (this.client as { getAll: (opts: Record<string, string | undefined>) => Promise<Mem0Memory[]> }).getAll(
        { user_id: userId, agent_id: agentId },
      );
      return (result ?? []).map((r) => ({
        id: r.id,
        content: r.memory,
        userId: r.user_id,
        agentId: r.agent_id,
        metadata: r.metadata,
        createdAt: r.created_at ?? new Date().toISOString(),
        updatedAt: r.updated_at,
      }));
    } catch (err) {
      process.stderr.write(`WARN: Mem0 getAll failed: ${err instanceof Error ? err.message : String(err)}\n`);
      return [];
    }
  }

  async delete(memoryId: string): Promise<void> {
    if (!this.client) return;
    try {
      await (this.client as { delete: (id: string) => Promise<void> }).delete(memoryId);
    } catch (err) {
      process.stderr.write(`WARN: Mem0 delete failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}
