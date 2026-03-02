# Task Contract: Strategy P0 Follow-up (Flywheel Operationalization)

**Date:** 2026-03-02
**Maker LLM:** Codex
**Confidence:** HIGH (0.85)

## Goal
Remove key operational blockers for strategy flywheel execution by adding bulk preference inference, stronger workflow preflight checks, and updated contracts/tests.

## Non-Goals
- No new vendor integrations (Langfuse/Composio/OpenPipe provisioning).
- No changes to core model routing logic.
- No production secret rotation in this task.

## Modules Touched
- `apps/api/src/routes/preferences.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/tests/preferences.test.ts`
- `apps/api/tests/auth.test.ts`
- `scripts/run-strategy-flywheel.ts`
- `.github/workflows/strategy-flywheel.yml`
- `docs/API_CONTRACTS.md`
- `docs/STRATEGY-READINESS-TODOS.md`

## Acceptance Criteria
- [x] Admin bulk endpoint exists: `POST /api/preferences/infer-all`
- [x] Flywheel runner auto-falls back to `/api/preferences/infer-all` when `FLYWHEEL_USER_IDS` is empty
- [x] Strategy workflow preflight fails fast on missing required secrets
- [x] API contracts + tests reflect new behavior

## Rollback Plan
- Revert this commit set from the follow-up branch/PR.
- Remove `/api/preferences/infer-all` route and auth rule.
- Restore previous flywheel workflow/runner behavior.

## Anti-Patterns Checked
- [x] Checked: Modify code without reading it first
- [x] Checked: Refactor route behavior without checking tests
- [x] Checked: AUTH_MODE/open behavior assumptions

## Proof Required
- [x] `apps/api` tests for preferences/auth pass
- [x] Flywheel runner dry-run output includes infer-all fallback path
- [x] API contract check remains green
