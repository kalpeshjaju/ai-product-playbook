# Missing Tests Audit

**Date:** 2026-03-01  
**Scope:** API routes, API middleware/services, shared-llm modules, apps (web/admin), shared-ui, E2E coverage.  
**Method:** Grep/glob for `*.test.ts`, `*.spec.ts`; map each source file to a test file; list gaps.

---

## 1. Summary

| Area | Tested | Missing (recommended) | Priority |
|------|--------|------------------------|----------|
| API routes | 13/15 | 2 route handlers | High |
| API middleware/services | partial (mocked in server) | 3 middleware, 1 thin util | Medium / Low |
| shared-llm | 24 test files, many modules | 4 modules | Medium |
| shared-ui | 2/3 components | 1 component | Low |
| apps/web, apps/admin | 0 unit tests | N/A (E2E only) | Low |
| E2E | 5 tests, 2 apps | 3 page flows | Medium |

---

## 2. API (`apps/api`)

### 2.1 Route handlers

| Route file | Test file | Status |
|------------|-----------|--------|
| prompts.ts | prompts.test.ts | ✅ |
| costs.ts | costs.test.ts | ✅ |
| memory.ts | memory.test.ts | ✅ |
| composio.ts | composio.test.ts | ✅ |
| documents.ts | documents.test.ts | ✅ |
| embeddings.ts | embeddings.test.ts | ✅ |
| generations.ts | generations.test.ts | ✅ |
| feedback.ts | feedback.test.ts | ✅ |
| transcription.ts | transcription.test.ts | ✅ |
| preferences.ts | preferences.test.ts | ✅ |
| openpipe.ts | openpipe.test.ts | ✅ |
| ingest.ts | ingest.test.ts | ✅ |
| few-shot.ts | few-shot.test.ts | ✅ |
| **entries.ts** | **—** | ❌ **Missing** |
| **users.ts** | **—** | ❌ **Missing** |

**Missing tests:**

1. **`apps/api/tests/entries.test.ts`**  
   - **Source:** `apps/api/src/routes/entries.ts` (GET/POST/PATCH/DELETE /api/entries, CRUD with Drizzle).  
   - **Suggest:** Test GET list (public), GET by id, POST (admin), PATCH (admin), DELETE (admin); validate VALID_CATEGORIES / VALID_STATUSES; 400 on invalid body.

2. **`apps/api/tests/users.test.ts`**  
   - **Source:** `apps/api/src/routes/users.ts` (GET /api/users via Clerk).  
   - **Suggest:** Mock `@clerk/backend`; test fail-open when CLERK_SECRET_KEY unset (empty array); test mapping of Clerk user list to AdminUser[] when configured.

**Note:** `server.test.ts` mocks `handleEntryRoutes` and `handleUserRoutes`; auth tier for `/api/entries` and `/api/users` is covered in `auth.test.ts`. The **handler logic** (DB, Clerk mapping) is untested.

### 2.2 Middleware and services

| Source | Test file | Status |
|--------|-----------|--------|
| server.ts | server.test.ts | ✅ |
| middleware/auth.ts | auth.test.ts | ✅ |
| rate-limiter.ts | rate-limiter.test.ts | ✅ |
| services/document-persistence.ts | document-persistence.test.ts | ✅ |
| cost-guard.ts | Only mocked in server/documents/embeddings tests | ⚠️ No dedicated test |
| middleware/turnstile.ts | Only mocked in server.test | ❌ **Missing** |
| middleware/prompt-ab.ts | Only mocked in prompts.test | ❌ **Missing** |
| middleware/posthog.ts | Only mocked in server.test | ❌ **Missing** |

**Missing tests (lower priority):**

3. **`apps/api/tests/turnstile.test.ts`**  
   - **Source:** `apps/api/src/middleware/turnstile.ts` (Cloudflare siteverify).  
   - **Suggest:** Unit test with mocked fetch: fail-open when NODE_ENV !== 'production'; fail-closed when TURNSTILE_SECRET_KEY unset in production; fail-closed when token empty; success/fail based on mock response.

4. **`apps/api/tests/cost-guard.test.ts`** (optional)  
   - **Source:** `apps/api/src/cost-guard.ts` — thin wrapper around `costLedger.ensureBudget()` / `getReport()`.  
   - **Suggest:** Mock shared-llm costLedger; test allowed path and CostLimitExceededError path. Low value if cost-ledger is well tested in shared-llm.

5. **prompt-ab.test.ts** / **posthog.test.ts** — optional; both are integration-heavy (AB routing, analytics). Mock and test public API if they grow.

---

## 3. Packages: shared-llm

| Module / file | Test file | Status |
|---------------|-----------|--------|
| identity/context.ts | identity-context.test.ts | ✅ |
| guardrails/scanner.ts, regex-scanner | scanner.test.ts, regex-scanner.test.ts | ✅ |
| json-extractor.ts | json-extractor.test.ts | ✅ |
| routing/router.ts | router.test.ts | ✅ |
| cost-ledger.ts | cost-ledger.test.ts | ✅ |
| fallback-monitor.ts | fallback-monitor.test.ts | ✅ |
| composio/* | composio.test.ts | ✅ |
| openpipe/* | openpipe.test.ts | ✅ |
| transcription/deepgram.ts | deepgram.test.ts | ✅ |
| parsing/document-parser.ts | document-parser.test.ts | ✅ |
| ingestion/* (registry, adapters, pipeline, chunking, dedup, freshness, types) | Multiple ingestion-*.test.ts, chunking, dedup, freshness | ✅ |
| preferences/inference.ts | preference-inference.test.ts | ✅ |
| **llm-client.ts** | **—** | ❌ **Missing** |
| **generation-logger.ts** | **—** | ❌ **Missing** |
| **guardrails/llama-guard-scanner.ts** | Mocked in scanner.test only | ❌ **No dedicated unit test** |
| **memory/** (factory, mem0-provider, zep-provider) | **—** | ❌ **Missing** |
| **analytics/** (events, index) | **—** | ❌ **Missing** |

**Missing tests (medium priority):**

6. **`packages/shared-llm/tests/llm-client.test.ts`**  
   - **Source:** `packages/shared-llm/src/llm-client.ts` (createLLMClient, LiteLLM proxy).  
   - **Suggest:** Mock fetch or use LiteLLM test double; test client creation, optional headers; optionally test chat/embeddings with mocked responses.

7. **`packages/shared-llm/tests/generation-logger.test.ts`**  
   - **Source:** `packages/shared-llm/src/generation-logger.ts`.  
   - **Suggest:** Test log/capture behavior with mocked dependencies.

8. **`packages/shared-llm/tests/llama-guard-scanner.test.ts`** (or keep integration-only)  
   - **Source:** `packages/shared-llm/src/guardrails/llama-guard-scanner.ts` (external API).  
   - **Suggest:** Mock HTTP to LlamaGuard/Together; test timeout, parse of response, severity mapping. Currently only mocked in scanner.test.ts.

9. **`packages/shared-llm/tests/memory-provider.test.ts`** (or mem0-provider.test.ts / zep-provider.test.ts)  
   - **Source:** `packages/shared-llm/src/memory/factory.ts`, mem0-provider.ts, zep-provider.ts.  
   - **Suggest:** Mock external Mem0/Zep APIs; test factory returns provider when keys set; test add/search/getAll/delete behavior.

10. **`packages/shared-llm/tests/analytics.test.ts`**  
    - **Source:** `packages/shared-llm/src/analytics/events.ts`, index.  
    - **Suggest:** Test event shape and any serialization; mock PostHog if needed.

---

## 4. Packages: shared-ui

| Component | Test file | Status |
|-----------|-----------|--------|
| data-card.tsx | data-card.test.tsx | ✅ |
| status-badge.tsx | status-badge.test.tsx | ✅ |
| **nav-link.tsx** | **—** | ❌ **Missing** |

**Missing test:**

11. **`packages/shared-ui/tests/nav-link.test.tsx`**  
    - **Source:** `packages/shared-ui/src/nav-link.tsx` (active-state link used in web + admin).  
    - **Suggest:** Render with React Testing Library; test active class when pathname matches href (exact and prefix); test child content.

---

## 5. Apps: web and admin

- **apps/web:** No `*.test.ts` / `*.test.tsx` (only E2E in `tests/e2e/web-smoke.spec.ts`).  
- **apps/admin:** No `*.test.ts` / `*.test.tsx` (only E2E in `tests/e2e/admin-smoke.spec.ts`).

**Recommendation:** Treat as low priority unless you add critical client logic (e.g. form validation, data transforms). E2E already covers main pages.

---

## 6. E2E (Playwright)

| App | Covered | Missing (suggested) |
|-----|---------|---------------------|
| Web | Home, nav links, /costs | /prompts page load |
| Admin | Home (sidebar), /memory | /prompts, /costs page load |

**Missing E2E tests:**

12. **Web: prompts page** — `test('prompts page loads', async ({ page }) => { await page.goto('/prompts'); ... })` in `tests/e2e/web-smoke.spec.ts`.

13. **Admin: prompts page** — Same for ADMIN_URL + `/prompts` in `tests/e2e/admin-smoke.spec.ts`.

14. **Admin: costs page** — Same for ADMIN_URL + `/costs` in `tests/e2e/admin-smoke.spec.ts`.

---

## 7. Priority checklist (for implementation)

| # | Test to add | Area | Priority |
|---|-------------|------|----------|
| 1 | entries.test.ts | API route | **High** |
| 2 | users.test.ts | API route | **High** |
| 3 | turnstile.test.ts | API middleware | Medium |
| 12 | E2E: web /prompts | E2E | Medium |
| 13 | E2E: admin /prompts | E2E | Medium |
| 14 | E2E: admin /costs | E2E | Medium |
| 6 | llm-client.test.ts | shared-llm | Medium |
| 7 | generation-logger.test.ts | shared-llm | Medium |
| 11 | nav-link.test.tsx | shared-ui | Low |
| 4 | cost-guard.test.ts | API | Low |
| 8–10 | llama-guard, memory, analytics | shared-llm | Low / optional |

---

## 8. Verification (how this audit was done)

- **Routes:** `Glob **/routes/*.ts` under `apps/api/src` → 15 files. Grep for corresponding `*.test.ts` under `apps/api/tests` → 13 matches; entries and users have no test file.
- **API middleware/services:** Listed `apps/api/src` (server, middleware/*, rate-limiter, cost-guard, services/*); grep for tests and for mocks in server.test → cost-guard, turnstile, prompt-ab, posthog only mocked.
- **shared-llm:** `Glob packages/shared-llm/src/**/*.ts` (56 files) vs `Glob packages/shared-llm/tests/*.ts` (24 files); matched by name and grep for imports in tests; gaps: llm-client, generation-logger, llama-guard (mock-only), memory/*, analytics/*.
- **shared-ui:** `Glob packages/shared-ui/src/*.{ts,tsx}` (nav-link, data-card, status-badge, etc.) vs tests → nav-link has no test.
- **E2E:** Read `tests/e2e/web-smoke.spec.ts` and `admin-smoke.spec.ts`; compared to NAV_ITEMS (/, /prompts, /costs, /memory) → web missing /prompts; admin missing /prompts, /costs.

You or another LLM can re-run the same globs/greps and compare to this document to confirm the list.
