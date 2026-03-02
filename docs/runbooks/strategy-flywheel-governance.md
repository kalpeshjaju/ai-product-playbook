# Runbook: Strategy Flywheel Governance

> Governs owner-approved defaults and change control for the weekly strategy flywheel.

## Scope

- Workflow: `.github/workflows/strategy-flywheel.yml`
- Runner: `scripts/run-strategy-flywheel.ts`
- Inputs under governance:
  - `FLYWHEEL_TASK_TYPES`
  - `FLYWHEEL_USER_IDS` (optional)
  - `FLYWHEEL_MIN_QUALITY_SCORE`
  - `FLYWHEEL_BUILD_LIMIT`
  - `FLYWHEEL_INFER_ALL_LIMIT`
  - `FLYWHEEL_INFER_MIN_FEEDBACK_COUNT`

## Ownership

- Primary owner: Platform/API owner (Kalpesh Jaju)
- Secondary owner: on-call engineer for strategy incidents
- Any default change requires owner approval and PR traceability.

## Approved Defaults

- `FLYWHEEL_TASK_TYPES=summarization,classification`
- `FLYWHEEL_USER_IDS` unset by default (runner uses `/api/preferences/infer-all`)
- `FLYWHEEL_MIN_QUALITY_SCORE=0.85`
- `FLYWHEEL_BUILD_LIMIT=20`
- `FLYWHEEL_INFER_ALL_LIMIT=100`
- `FLYWHEEL_INFER_MIN_FEEDBACK_COUNT=3`

## Variable Setup (GitHub repo variables)

Run from repo root:

```bash
gh variable set FLYWHEEL_TASK_TYPES --body "summarization,classification"
gh variable set FLYWHEEL_MIN_QUALITY_SCORE --body "0.85"
gh variable set FLYWHEEL_BUILD_LIMIT --body "20"
gh variable set FLYWHEEL_INFER_ALL_LIMIT --body "100"
gh variable set FLYWHEEL_INFER_MIN_FEEDBACK_COUNT --body "3"
gh variable delete FLYWHEEL_USER_IDS || true
```

## Verification

1. Confirm repo variables:
   - `gh variable list | rg '^FLYWHEEL_'`
2. Run live flywheel once:
   - `gh workflow run strategy-flywheel.yml`
   - `gh run list --workflow \"Strategy Flywheel\" --limit 1`
3. Confirm artifact:
   - `strategy-flywheel-report` uploaded with `failures = 0`

## Change Management

1. Open PR updating this runbook and (if needed) `docs/STRATEGY-READINESS-TODOS.md`.
2. Change repo vars via `gh variable set`.
3. Run one manual flywheel execution after change.
4. Store run URL in PR proof section.
