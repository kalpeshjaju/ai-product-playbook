/**
 * FILE PURPOSE: Barrel export for Composio agent tool integrations
 *
 * WHY: Single import point for Composio client and types.
 *      Import: `import { executeAction, getAvailableActions } from '@playbook/shared-llm'`
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

export { createComposioClient, getAvailableActions, executeAction } from './client.js';
export type { ComposioAction, ComposioActionResult } from './types.js';
