# Task Contract: Strategy Pillar Readiness Hardening

**Date:** 2026-03-02
**Maker LLM:** Codex
**Confidence:** HIGH (0.85)

## Goal
Implement missing Strategy pillar enforcement and automation so production readiness is measurable and CI-blocking for core moat loops.

## Non-Goals
- Implementing new product features beyond readiness controls.
- Integrating new third-party vendors (Mem0/Zep/OpenPipe/RouteLLM) in this task.
- Replacing existing auth or ingestion architecture.

## Modules Touched
- `.github/workflows/ci.yml`
- `.github/workflows/strategy-flywheel.yml`
- `scripts/check-context-injection.sh`
- `scripts/check-user-identity.sh`
- `scripts/check-ai-logging.sh`
- `scripts/run-strategy-flywheel.ts`
- `docs/MOAT-STACK-SETUP.md`
- `docs/STRATEGY-READINESS-TODOS.md`

## Acceptance Criteria
- [x] CI includes blocking gates for context injection, user identity, and AI logging.
- [x] New check scripts fail on missing requirements and pass on current compliant code.
- [x] A scheduled workflow exists for weekly flywheel operations (few-shot refresh, preference inference, moat snapshot).
- [x] Strategy readiness TODO doc clearly marks done vs pending vs production-ready items.
- [x] Relevant tests/checks execute successfully for modified files.

## Rollback Plan
- Revert this PR commit set.
- Remove new CI steps and workflow file.
- Delete newly added scripts/docs if needed.

## Anti-Patterns Checked
- [x] Checked: Skip learning journal
- [x] Checked: Modify code without reading it first
- [x] Checked: AUTH_MODE=open in CI
- [x] Checked: Refactor route behavior without verifying tests

## Proof Required
- [x] Script execution output for new hard gates
- [x] Type-check/lint/tests for modified modules
- [ ] Workflow YAML validation via CI run
