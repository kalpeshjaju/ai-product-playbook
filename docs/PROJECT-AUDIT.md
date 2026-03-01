# Project Audit

**Date:** 2026-03-01 (readiness redo)  
**Scope:** Playbook readiness alignment (docs truth, enforced gates, security controls, and test reliability).

---

## 1. Validation Run (evidence)

Executed locally during this audit:

- `npm run check` ✅ (18/18 tasks, 135 API tests)
- `python3 scripts/check_architecture_limits.py` ✅
- `bash scripts/check-rate-limit.sh` ✅
- `bash scripts/check-api-contracts.sh` ✅ (45 routes documented)
- `bash scripts/check-guardrail-usage.sh` ✅ (3/3 external-text routes scanned)
- `npx playwright test` ✅ (5/5 E2E tests passing)

---

## 2. Readiness Score vs Playbook Goal

**Overall readiness:** **9.2 / 10** (up from 7.8)
Interpretation: all three target-state gaps are now blocking in CI. Remaining 0.8 is operational maturity (rotation cadence, runbook drills, pen-test).

| Playbook Area | Status | Evidence |
|---|---|---|
| Tier-1 docs are concrete | Improved | `docs/PRODUCT.md`, `docs/DECISIONS.md` now contain real content, not templates |
| Architecture limits enforced | Implemented | architecture check passes; long test block refactored |
| LLM callsite rate/cost guarding | Implemented (for active callsites) | document/embedding routes now enforce `checkTokenBudget()` + `checkCostBudget()` |
| API contract sync | Implemented | contracts check passes (`45 routes documented`) |
| Unit/integration test health | Implemented | `npm run check` green across workspaces |
| E2E smoke reliability | Implemented | Playwright runs deterministically on `3100/3101`, 5/5 passing |
| Security scan strictness | Enforced | GitGuardian + Semgrep SAST are blocking in CI `security` job |
| SAST / npm audit hard gates | Enforced | `npm audit --audit-level high` blocking in `quality-gates`; Semgrep blocking in `security` |
| Mandatory guardrail usage on all user-facing LLM outputs | Enforced | `scanOutput()` wired into `transcription.ts`, `composio.ts`, `memory.ts`; CI gate `check-guardrail-usage.sh` |

---

## 3. What Was Fixed in This Redo

1. **LLM budget enforcement coverage expanded**  
   - Added token + cost checks around document embedding generation and embedding search callsites.
   - Added provider-layer cost ledger recording for those embedding calls.

2. **Rate-limit CI gate made more accurate**  
   - `scripts/check-rate-limit.sh` now scopes to API source and detects concrete LLM call patterns, reducing false positives/negatives.

3. **Architecture hard gate now passing**  
   - Split oversized test callback in `packages/shared-llm/tests/preference-inference.test.ts`.

4. **E2E test determinism restored**  
   - Playwright now uses dedicated ports and starts both web/admin servers.
   - Admin smoke test uses explicit admin base URL for test runtime isolation.

5. **Doc truthfulness improved**  
   - Replaced template `PRODUCT.md` and empty `DECISIONS.md` with concrete project definitions.
   - Updated security/constraints docs to match current enforcement status.

---

## 4. Remaining Gaps (for Full Production Readiness)

All three prior target-state gaps are now resolved:

1. ~~Promote advisory security checks to blocking~~ — Done: `continue-on-error` removed, Semgrep SAST added
2. ~~Add hard CI gate for npm audit + SAST~~ — Done: both blocking in CI
3. ~~Enforce mandatory route-level guardrail execution~~ — Done: `scanOutput()` wired + CI gate

Remaining operational items (0.8 gap):
- Secret rotation cadence not yet automated (quarterly manual process)
- No external pen-test completed yet
- Incident runbook drills not yet scheduled

---

## 5. Recommendation

Production-ready for controlled deploy. Operational maturity items above are standard post-launch activities, not blockers.
