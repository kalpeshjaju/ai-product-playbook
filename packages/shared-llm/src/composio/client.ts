/**
 * FILE PURPOSE: Composio SDK wrapper for agent tool integrations
 *
 * WHY: Playbook §20 — enables agents to call 1000+ external tools
 *      (Slack, GitHub, Gmail, Jira, etc.) via Composio's unified API.
 * HOW: Wraps the composio-core SDK. No-op when COMPOSIO_API_KEY not set —
 *      returns empty actions list and noop results.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import type { ComposioAction, ComposioActionResult } from './types.js';

let composioClient: unknown;
let initialized = false;

/**
 * Initialize the Composio client. Idempotent — safe to call multiple times.
 * No-op when COMPOSIO_API_KEY not set.
 */
export function createComposioClient(): void {
  if (initialized) return;
  initialized = true;

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    process.stderr.write('INFO: COMPOSIO_API_KEY not set — Composio tool integrations disabled\n');
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Composio } = require('composio-core') as { Composio: new (opts: { apiKey: string }) => unknown };
    composioClient = new Composio({ apiKey });
  } catch {
    process.stderr.write('WARN: Failed to initialize composio-core — is the package installed?\n');
  }
}

/** Raw action shape from Composio SDK */
interface RawComposioAction {
  name?: string;
  description?: string;
  appName?: string;
  parameters?: Record<string, unknown>;
  requiresAuth?: boolean;
}

/**
 * Get available actions, optionally filtered by app name.
 * Returns empty array when Composio is disabled.
 */
export async function getAvailableActions(appName?: string): Promise<ComposioAction[]> {
  createComposioClient();
  if (!composioClient) return [];

  try {
    const client = composioClient as {
      actions: {
        list: (opts?: { appName?: string }) => Promise<RawComposioAction[]>;
      };
    };
    const actions = await client.actions.list(appName ? { appName } : undefined);
    return (actions ?? []).map((a) => ({
      name: a.name ?? 'unknown',
      description: a.description ?? '',
      appName: a.appName ?? 'unknown',
      parameters: a.parameters ?? {},
      requiresAuth: a.requiresAuth ?? false,
    }));
  } catch (err) {
    process.stderr.write(`WARN: Composio getAvailableActions failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return [];
  }
}

/**
 * Execute a Composio action with the given parameters.
 * Returns a noop result when Composio is disabled.
 */
export async function executeAction(
  actionName: string,
  params: Record<string, unknown>,
  entityId?: string,
): Promise<ComposioActionResult> {
  const startMs = Date.now();
  createComposioClient();

  if (!composioClient) {
    return {
      success: true,
      data: {},
      metadata: { actionName, executionTimeMs: 0, noop: true },
    };
  }

  try {
    const client = composioClient as {
      actions: {
        execute: (opts: { actionName: string; params: Record<string, unknown>; entityId?: string }) => Promise<Record<string, unknown>>;
      };
    };
    const result = await client.actions.execute({
      actionName,
      params,
      entityId,
    });
    return {
      success: true,
      data: result ?? {},
      metadata: { actionName, executionTimeMs: Date.now() - startMs, noop: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`WARN: Composio executeAction "${actionName}" failed: ${message}\n`);
    return {
      success: false,
      data: {},
      error: message,
      metadata: { actionName, executionTimeMs: Date.now() - startMs, noop: false },
    };
  }
}
