/**
 * FILE PURPOSE: Full-stack E2E tests for admin app against live Docker infrastructure
 *
 * WHY: Validates admin panel loads and connects to real API.
 *      Admin has unique routes (cost reset, prompt management, memory browser)
 *      that need the full backend stack.
 *
 * HOW: Requires full Docker stack + admin dev server on port 3001.
 *      Run via: scripts/test-e2e-infra.sh (Layer 3)
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { test, expect } from '@playwright/test';

const ADMIN_URL = 'http://localhost:3001';

test.describe('Admin App — Full Stack', () => {
  test('admin homepage loads with user data from API', async ({ page }) => {
    await page.goto(ADMIN_URL);
    // Sidebar brand
    await expect(page.getByText('Admin')).toBeVisible();
    // Users page heading
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    // User data from API (/api/users) — should show at least one user entry
    await expect(page.locator('[data-testid="user-name"]').or(page.locator('table tbody tr')).or(page.getByRole('listitem')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin sidebar navigation works', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await expect(page.getByRole('link', { name: 'Memory' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Prompts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Costs' })).toBeVisible();
  });

  test('memory browser page loads', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/memory`);
    await expect(page.getByRole('heading', { name: 'Memory Browser' })).toBeVisible();
    // The memory browser has a userId input field
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 10_000 });
  });

  test('admin cost dashboard loads with real data', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/costs`);
    await expect(page.getByRole('heading', { name: 'Cost Dashboard' })).toBeVisible();
    // DataCards from /api/costs
    await expect(page.getByText('Total Cost')).toBeVisible({ timeout: 10_000 });
    // Cost reset button should be present (admin-only feature)
    await expect(page.getByRole('button', { name: /Reset/i })).toBeVisible();
  });

  test('admin prompts page loads', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/prompts`);
    await expect(page.getByRole('heading', { name: 'Prompt Management' })).toBeVisible();
    // Prompt manager form should be visible
    await expect(page.getByText('Create Prompt Version')).toBeVisible({ timeout: 10_000 });
  });
});
