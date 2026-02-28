/**
 * FILE PURPOSE: Composio type definitions for agent tool integrations
 *
 * WHY: Playbook §20 — Composio gives agents access to 1000+ external tools
 *      (Slack, GitHub, Gmail, etc.) via a unified API.
 * HOW: Defines typed action/result shapes that the Composio client operates on.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

/** A Composio action that an agent can execute. */
export interface ComposioAction {
  /** Unique action identifier (e.g., "SLACK_SEND_MESSAGE") */
  name: string;
  /** Human-readable description of what the action does */
  description: string;
  /** The app/integration this action belongs to (e.g., "slack", "github") */
  appName: string;
  /** JSON Schema describing the action's input parameters */
  parameters: Record<string, unknown>;
  /** Whether the action requires user authentication */
  requiresAuth: boolean;
}

/** Result of executing a Composio action. */
export interface ComposioActionResult {
  /** Whether the action executed successfully */
  success: boolean;
  /** The action's return data (shape varies by action) */
  data: Record<string, unknown>;
  /** Error message if success is false */
  error?: string;
  /** Execution metadata */
  metadata: {
    /** The action that was executed */
    actionName: string;
    /** Execution time in milliseconds */
    executionTimeMs: number;
    /** Whether this was a no-op (key not set) */
    noop: boolean;
  };
}
