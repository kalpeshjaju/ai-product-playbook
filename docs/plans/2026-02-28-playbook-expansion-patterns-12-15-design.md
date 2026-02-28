# Design: Playbook Expansion — Patterns 12-15

> **Date**: 2026-02-28
> **Owner**: Kalpesh Jaju
> **Status**: Approved

## Context

Feedback review identified 4 patterns that need expansion in `LLM-MAINTAINED-ENTERPRISE-PLAYBOOK.md`. Three (13-15) are already partially covered; one (#12) is only a one-liner mention.

## Changes

### 1. Monthly Chaos Test (Deep Expansion)

**Section**: 9 (Eval Harness), new subsection after "Eval Harness Reliability" (~line 1757)

**Content**:
- Purpose: measures actual test suite catch rate, not theoretical coverage
- Full implementation: LLM injects 3 categorized bugs into a feature branch
- Bug categories: logic (remove guard), data (swap fields), security (remove auth)
- Scoring: monthly catch rate trend, category breakdown, action thresholds
- Promptfoo YAML config for automated chaos runs
- Example bugs with before/after code
- Enforcement: monthly scheduled CI, results → DRILLS.md
- Appendix D: `[SOFT CHECK]` entry

### 2. Prompt Injection in PR Descriptions (Small Expansion)

**Section**: 7 (Security Controls), after line 1230

**Content**:
- 3 specific attack vector examples
- Safe PR review pipeline code pattern
- Sanitization example

### 3. Doc Freshness Enforcement (Small Expansion)

**Section**: 5 (Enforcement Architecture), after line ~928

**Content**:
- Why doc drift causes LLM hallucination
- playbook.config.yaml explanation
- Graduated enforcement levels

### 4. Streaming-First Hard Gate (Small Expansion)

**Section**: 16 (AI Product Stack), after line 2822

**Content**:
- Actual ESLint rule config
- TTFT SLO target (< 800ms)
- Exemption pattern for batch/webhook/cron

### 5. Appendix D

- Add chaos test entry to `[SOFT CHECK]` section
