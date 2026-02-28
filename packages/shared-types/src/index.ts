/**
 * FILE PURPOSE: Shared types across all apps in the monorepo
 *
 * WHY: Single source of truth for data models. All apps import from here
 *      instead of defining their own copies.
 * HOW: Export interfaces and types consumed by apps/web, apps/admin, etc.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

/** A single entry in the LLM playbook — displayed on the web app homepage. */
export interface PlaybookEntry {
  id: string;
  title: string;
  summary: string;
  category: 'resilience' | 'cost' | 'quality' | 'deployment';
  status: Status;
}

/** An admin user — displayed on the admin panel. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
}

/** Status values shared across apps for UI consistency. */
export type Status = 'active' | 'draft' | 'deprecated';

/** A prompt version record — §20 Prompt Versioning schema. */
export interface PromptVersion {
  id: string;
  prompt_name: string;
  version: string;
  content: string;
  content_hash: string;
  eval_score: number | null;
  active_pct: number;
  author: string;
  created_at: string;
}
