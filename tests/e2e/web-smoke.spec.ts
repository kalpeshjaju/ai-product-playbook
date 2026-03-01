/**
 * FILE PURPOSE: Web app smoke tests — verifies core pages load
 *
 * WHY: Catches deploy regressions before they reach production.
 *      Golden smoke tests validate the most critical user paths.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { test, expect } from '@playwright/test';

test.describe('Web App Smoke Tests', () => {
  test('homepage loads with heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'AI Product Playbook' })).toBeVisible();
  });

  test('nav links are visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Prompts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Costs' })).toBeVisible();
  });

  test('costs page loads without crash', async ({ page }) => {
    await page.goto('/costs');
    await expect(page).toHaveURL(/\/costs/);
    await expect(page.getByRole('heading', { name: /costs/i })).toBeVisible();
  });

  test('prompts page loads without crash', async ({ page }) => {
    await page.goto('/prompts');
    await expect(page).toHaveURL(/\/prompts/);
    await expect(page.getByRole('heading', { name: /prompts/i })).toBeVisible();
  });
});
