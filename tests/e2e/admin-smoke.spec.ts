/**
 * FILE PURPOSE: Admin app smoke tests — verifies core pages load
 *
 * WHY: Catches deploy regressions in the admin panel.
 *      Admin runs on port 3001 (separate Next.js app).
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { test, expect } from '@playwright/test';

test.describe('Admin App Smoke Tests', () => {
  test('admin homepage loads with sidebar', async ({ page }) => {
    await page.goto('http://localhost:3001/');
    await expect(page.getByText('Admin')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Memory' })).toBeVisible();
  });

  test('memory page loads', async ({ page }) => {
    await page.goto('http://localhost:3001/memory');
    await expect(page.getByRole('heading', { name: 'Memory Browser' })).toBeVisible();
  });
});
