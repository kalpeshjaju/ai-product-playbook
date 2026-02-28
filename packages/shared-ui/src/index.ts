/**
 * FILE PURPOSE: Shared UI components (web + admin reuse)
 *
 * WHY: Desktop web app and admin panel share common components.
 *      Extracting them here prevents duplication and drift.
 * HOW: Export React components consumed by apps/web and apps/admin.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

export { StatusBadge } from './status-badge.js';
export type { StatusBadgeProps } from './status-badge.js';
