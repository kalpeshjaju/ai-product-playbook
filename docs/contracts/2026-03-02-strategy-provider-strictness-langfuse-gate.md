# Task Contract: Strategy Provider Strictness + Langfuse Live Gate

**Date:** 2026-03-02
**Maker LLM:** Codex
**Confidence:** HIGH (0.85)

## Goal
Implement production-safe strictness behavior for fail-open strategy providers (Composio/OpenPipe/Memory) and add a live Langfuse verification gate in production smoke checks.

## Non-Goals
- No vendor onboarding/provisioning itself (just enforcement + verification hooks).
- No changes to core LLM routing models.
- No UI changes.

## Modules Touched
- `apps/api/src/middleware/provider-policy.ts`
- `apps/api/src/routes/composio.ts`
- `apps/api/src/routes/openpipe.ts`
- `apps/api/src/routes/memory.ts`
- `apps/api/tests/provider-policy.test.ts`
- `apps/api/tests/composio.test.ts`
- `apps/api/tests/openpipe.test.ts`
- `apps/api/tests/memory.test.ts`
- `scripts/check-strategy-provider-policy.sh`
- `scripts/check-langfuse-live.sh`
- `.github/workflows/ci.yml`
- `.github/workflows/smoke-prod.yml`
- `docs/API_CONTRACTS.md`
- `docs/GITHUB_SECRETS.md`
- `docs/STRATEGY-READINESS-TODOS.md`

## Acceptance Criteria
- [x] Strategy providers use a shared policy with strict/open behavior.
- [x] Strategy routes enforce provider availability through policy middleware.
- [x] CI blocks if strategy routes bypass policy.
- [x] Production smoke pipeline runs Langfuse live check script.
- [x] Tests and API contracts align with strict/open behavior.

## Rollback Plan
- Revert this commit set.
- Remove provider-policy middleware usage and new scripts.
- Remove added workflow steps and restore previous route behavior.

## Anti-Patterns Checked
- [x] Checked: Modify code without reading it first
- [x] Checked: Refactor route behavior without checking tests
- [x] Checked: AUTH_MODE/open in production style pitfalls

## Proof Required
- [x] Targeted route + policy tests pass
- [x] Policy CI scripts pass
- [x] API contracts check passes
- [x] Langfuse gate script skip-path and invocation wiring validated
