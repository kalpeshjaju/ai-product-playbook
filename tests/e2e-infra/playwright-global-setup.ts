/**
 * FILE PURPOSE: Preflight checks for full-stack Playwright infra tests
 *
 * WHY: Prevents misleading UI failures when API infra is not running.
 * HOW: Verifies /api/health is reachable before browser tests start.
 */

import type { FullConfig } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3002';
const HEALTH_URL = `${API_URL}/api/health`;

async function assertApiReachable(): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(HEALTH_URL, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`health returned HTTP ${res.status}`);
    }
  } catch (err) {
    throw new Error(
      `[fullstack-e2e] API preflight failed at ${HEALTH_URL}: ` +
      `${err instanceof Error ? err.message : String(err)}. ` +
      'Start API + infra first (for example: docker compose up -d).',
    );
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await assertApiReachable();
}
