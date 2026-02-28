/**
 * FILE PURPOSE: Barrel export for intelligent model routing
 *
 * WHY: Single import point for routing functions and types.
 *      Import: `import { routeQuery } from '@playbook/shared-llm'`
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

export { routeQuery } from './router.js';
export type { ModelTier, RoutingConfig, RoutingDecision } from './router.js';
