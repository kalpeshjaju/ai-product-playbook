# Strategy Readiness TODOs (Sections 20–22)

**Date:** 2026-03-02  
**Scope:** Competitive moat execution, flywheel automation, personalization, and data-loop readiness.

## 1. Current state at a glance

- **Implemented in code/workflows:** core moat schema, prompt A/B plumbing, preference/few-shot endpoints, moat-health endpoint, strategy hard-gate scripts, weekly flywheel workflow.
- **Not yet production-real-world complete:** several integrations remain env-gated/fail-open, some tool stacks are only partially operational, and moat loop outcomes are not yet fully automated from production traffic.

## 2. Done (verified in repo)

- [x] **Moat schema foundation exists** (`prompt_versions`, `ai_generations`, `user_preferences`, `outcomes`, `few_shot_bank`).
  - Evidence: `apps/api/src/db/schema.ts`
- [x] **Prompt versioning + promotion ladder API exists** (0→10→50→100 with eval gate).
  - Evidence: `apps/api/src/routes/prompts.ts`
- [x] **Prompt A/B resolution exists** (PostHog feature flag + weighted fallback).
  - Evidence: `apps/api/src/middleware/prompt-ab.ts`, `apps/api/src/middleware/posthog.ts`
- [x] **Preference inference route exists** (`POST /api/preferences/:userId/infer`).
  - Evidence: `apps/api/src/routes/preferences.ts`
- [x] **Few-shot auto-curation route exists** (`POST /api/few-shot/build`).
  - Evidence: `apps/api/src/routes/few-shot.ts`
- [x] **Moat health API exists** (`GET /api/moat-health`).
  - Evidence: `apps/api/src/routes/moat.ts`
- [x] **AI quality logging flow exists** (`POST /api/generations`, feedback/outcomes).
  - Evidence: `apps/api/src/routes/generations.ts`, `apps/api/src/routes/feedback.ts`
- [x] **Strategy CI hard gates now exist and are blocking in CI**.
  - Evidence: `scripts/check-context-injection.sh`, `scripts/check-user-identity.sh`, `scripts/check-ai-logging.sh`, `.github/workflows/ci.yml`
- [x] **Weekly flywheel automation workflow now exists** (few-shot refresh, preference inference, moat snapshot report).
  - Evidence: `scripts/run-strategy-flywheel.ts`, `.github/workflows/strategy-flywheel.yml`
- [x] **Bulk preference inference endpoint exists for automated loops** (`POST /api/preferences/infer-all`).
  - Evidence: `apps/api/src/routes/preferences.ts`
- [x] **Flywheel workflow now has config/secret preflight with infer-all fallback**.
  - Evidence: `.github/workflows/strategy-flywheel.yml`, `scripts/run-strategy-flywheel.ts`
- [x] **Strategy provider strictness policy implemented** (Composio/OpenPipe/Memory).
  - Evidence: `apps/api/src/middleware/provider-policy.ts`, strategy routes + tests
- [x] **Langfuse live verification gate added to production smoke flow**.
  - Evidence: `scripts/check-langfuse-live.sh`, `.github/workflows/smoke-prod.yml`

## 3. P0 pending (must close for real-world production readiness)

- [ ] **Enforce Langfuse live gate in production runs** (`LANGFUSE_LIVE_REQUIRED=true` + secrets).
  - Gap: live gate exists, but currently runs in optional mode when Langfuse secrets/flag are not configured.
  - Close by: configure `PRODUCTION_LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and set `LANGFUSE_LIVE_REQUIRED=true`.
- [ ] **Finalize production env settings for provider policy** (`STRATEGY_PROVIDER_MODE`, optional break-glass flag).
  - Gap: code now defaults to strict in production, but env policy ownership/runbook still needs explicit sign-off.
  - Close by: set env defaults across Railway/Vercel + document break-glass procedure.
- [ ] **Finalize flywheel scope governance** (`FLYWHEEL_TASK_TYPES`, optional `FLYWHEEL_USER_IDS`).
  - Gap: workflow now supports infer-all fallback, but owner-level defaults/runbook still need explicit org sign-off.
  - Close by: configure repo vars + add owner runbook entry.
- [ ] **Add integration test for flywheel runner against live/staging API**.
  - Gap: current validation is local dry-run.
  - Close by: CI/manual job that asserts successful non-dry-run execution and zero failures.
- [x] **Add guardrail around API credentials required by scheduled workflow**.
  - Closed by: preflight step in `strategy-flywheel.yml` that hard-fails on missing `API_URL/API_KEY/ADMIN_API_KEY`.

## 4. P1 pending (moat depth + compounding quality)

- [ ] **Automate prompt promotion decisions from live outcomes** (not manual endpoint calls only).
  - Gap: promote route exists, but no recurring evaluator that promotes/rolls back based on thresholds.
- [ ] **Schedule DSPy optimization cadence** (currently manual dispatch).
  - Gap: optimizer exists but is not part of automatic quality loops.
- [ ] **RouteLLM rollout experiment** (ROUTELLM-enabled A/B against static routing).
  - Gap: router exists; no production experiment report.
- [ ] **OpenPipe first production fine-tune cycle** (1k+ high-quality examples).
  - Gap: logging/trigger endpoints exist; no verified first training loop.
- [ ] **Memory layer production enablement** (Mem0 or Zep with explicit success metrics).
  - Gap: provider code exists; default behavior is disabled/fail-open without credentials.
- [ ] **Composio production toolkit connection** (at least one real integration).
  - Gap: SDK/routes exist; real account/tool auth and action safety controls not verified here.

## 5. P2 pending (scale + moat defensibility proof)

- [ ] **Braintrust merge-blocking activation** (env-gated workflow currently).
- [ ] **Qodo Cover activation and governance** (env-gated workflow currently).
- [ ] **Synthetic data pipeline validation at scale** (Gretel script exists; quality gate automation pending).
- [ ] **Monthly moat review artifact** (trend report with flywheel velocity, conversion lift, personalization impact).

## 6. Real-world readiness verdict

- **Strategy pillar code-readiness:** **Moderate-High** (core components implemented).
- **Strategy pillar production-readiness:** **Moderate** (critical operations/policies and live-loop proof still pending).
- **Biggest remaining work:** convert env-gated and manual loops into continuously verified production loops with evidence.
