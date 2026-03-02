# Task Contract: Strategy Prompt Promotion Loop + Flywheel Governance

**Date:** 2026-03-02
**Maker LLM:** Codex
**Confidence:** HIGH (0.85)

## Goal
Add a production-ready automation loop that evaluates live prompt outcomes and applies promotion/rollback decisions on schedule, while finalizing flywheel governance defaults in repo variables and runbooks.

## Non-Goals

- No first live production run evidence in this PR.
- No provider account onboarding (OpenPipe/Composio/Memory).
- No UI changes.

## Modules Touched

- `apps/api/src/services/prompt-promotion-policy.ts`
- `apps/api/tests/prompt-promotion-policy.test.ts`
- `scripts/run-prompt-promotion-loop.ts`
- `.github/workflows/prompt-promotion-loop.yml`
- `docs/STRATEGY-READINESS-TODOS.md`
- `docs/GITHUB_SECRETS.md`
- `docs/MOAT-STACK-SETUP.md`
- `docs/runbooks/strategy-flywheel-governance.md`
- `docs/runbooks/strategy-provider-policy.md`
- `.env.example`

## Acceptance Criteria

- [x] A scheduled prompt promotion workflow exists and produces a JSON report artifact.
- [x] Promotion/rollback policy logic is explicit and unit-tested.
- [x] Flywheel governance defaults are documented in a runbook.
- [x] GitHub repo flywheel/promotion variables are configured with approved defaults.
- [x] Strategy readiness doc reflects done vs pending accurately.

## Rollback Plan

- Revert this PR to remove workflow/script and policy module.
- Delete added repo variables (`FLYWHEEL_*`, `PROMOTION_*`) if needed.
- Keep previous manual promotion flow via `scripts/promote-prompt.sh`.

## Anti-Patterns Checked

- [x] Checked: Modify code without reading it first.
- [x] Checked: Refactor route behavior without checking tests.
- [x] Checked: Deploy assumptions without env/secret verification.

## Proof Required

- [x] Unit tests for promotion policy pass.
- [x] Provider policy tests still pass after merge.
- [x] API type-check passes.
- [x] Doc freshness check passes.
