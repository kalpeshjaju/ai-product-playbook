/**
 * FILE PURPOSE: Barrel export for the identity tracking module
 *
 * WHY: Single import point for user context extraction and Langfuse header generation.
 *      Import: `import { createUserContext, withLangfuseHeaders } from '@playbook/shared-llm'`
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

export {
  createUserContext,
  createUserContextFromValues,
  withLangfuseHeaders,
} from './context.js';
export type { RequestLike } from './context.js';
export type { UserContext, LangfuseHeaders } from './types.js';
