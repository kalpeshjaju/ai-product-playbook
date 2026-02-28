/**
 * FILE PURPOSE: Zep implementation of AgentMemoryProvider
 *
 * WHY: Zep provides temporal knowledge graphs — tracks conversation history
 *      with automatic entity extraction and temporal reasoning.
 *      Best for: conversation context, entity tracking, temporal queries.
 * HOW: Wraps the @getzep/zep-js SDK. Fail-open when ZEP_API_KEY not set.
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

/** Shape returned by Zep memory search */
interface ZepSearchResult {
  message?: { uuid?: string; content?: string; created_at?: string };
  score?: number;
  metadata?: Record<string, string | number | boolean>;
}

/** Shape returned by Zep get session messages */
interface ZepMessage {
  uuid?: string;
  content?: string;
  role?: string;
  metadata?: Record<string, string | number | boolean>;
  created_at?: string;
  updated_at?: string;
}

export class ZepProvider implements AgentMemoryProvider {
  readonly name = 'zep';
  private client: unknown;

  constructor() {
    const apiKey = process.env.ZEP_API_KEY;
    if (!apiKey) {
      process.stderr.write('INFO: ZEP_API_KEY not set — Zep provider will return empty results\n');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ZepClient } = require('@getzep/zep-js') as { ZepClient: { init: (apiKey: string, baseUrl?: string) => unknown } };
      const baseUrl = process.env.ZEP_BASE_URL;
      this.client = ZepClient.init(apiKey, baseUrl);
    } catch {
      process.stderr.write('WARN: Failed to initialize @getzep/zep-js — is the package installed?\n');
    }
  }

  /**
   * Derive a Zep session ID from user + agent context.
   * Zep organizes memories by session, so we create deterministic session IDs.
   */
  private sessionId(userId: string, agentId?: string): string {
    return agentId ? `${userId}__${agentId}` : userId;
  }

  async add(content: string, options: AddMemoryOptions): Promise<string> {
    if (!this.client) return 'noop';
    try {
      const sessionId = this.sessionId(options.userId, options.agentId);
      const zep = this.client as {
        memory: {
          add: (sessionId: string, opts: { messages: Array<{ role: string; role_type: string; content: string; metadata?: Record<string, string | number | boolean> }> }) => Promise<void>;
        };
      };
      await zep.memory.add(sessionId, {
        messages: [{
          role: 'user',
          role_type: 'user',
          content,
          metadata: options.metadata,
        }],
      });
      return sessionId;
    } catch (err) {
      process.stderr.write(`WARN: Zep add failed: ${err instanceof Error ? err.message : String(err)}\n`);
      return 'error';
    }
  }

  async search(query: string, options: SearchMemoryOptions): Promise<MemorySearchResult[]> {
    if (!this.client) return [];
    try {
      const sessionId = this.sessionId(options.userId, options.agentId);
      const zep = this.client as {
        memory: {
          search: (sessionId: string, opts: { text: string; limit?: number }) => Promise<ZepSearchResult[]>;
        };
      };
      const results = await zep.memory.search(sessionId, {
        text: query,
        limit: options.limit ?? 10,
      });
      return (results ?? []).map((r) => ({
        entry: {
          id: r.message?.uuid ?? 'unknown',
          content: r.message?.content ?? '',
          userId: options.userId,
          agentId: options.agentId,
          metadata: r.metadata,
          createdAt: r.message?.created_at ?? new Date().toISOString(),
        },
        score: r.score ?? 0,
      }));
    } catch (err) {
      process.stderr.write(`WARN: Zep search failed: ${err instanceof Error ? err.message : String(err)}\n`);
      return [];
    }
  }

  async getAll(userId: string, agentId?: string): Promise<MemoryEntry[]> {
    if (!this.client) return [];
    try {
      const sessionId = this.sessionId(userId, agentId);
      const zep = this.client as {
        message: {
          getSessionMessages: (sessionId: string) => Promise<{ messages?: ZepMessage[] }>;
        };
      };
      const response = await zep.message.getSessionMessages(sessionId);
      return (response?.messages ?? []).map((m) => ({
        id: m.uuid ?? 'unknown',
        content: m.content ?? '',
        userId,
        agentId,
        metadata: m.metadata,
        createdAt: m.created_at ?? new Date().toISOString(),
        updatedAt: m.updated_at,
      }));
    } catch (err) {
      process.stderr.write(`WARN: Zep getAll failed: ${err instanceof Error ? err.message : String(err)}\n`);
      return [];
    }
  }

  async delete(memoryId: string): Promise<void> {
    if (!this.client) return;
    try {
      const zep = this.client as {
        message: { deleteMessage: (id: string) => Promise<void> };
      };
      await zep.message.deleteMessage(memoryId);
    } catch (err) {
      process.stderr.write(`WARN: Zep delete failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}
