# /contract Skill — Task Contract Generator

> For Claude Code users. Other LLMs: follow the template at `docs/contracts/TEMPLATE.md` manually.

## When to Use

Before starting ANY implementation task. This is Pillar 1 of the LLM Coding Framework.

## What It Does

1. Reads the user's request
2. Scans `docs/LEARNING_JOURNAL.md` anti-pattern registry for relevant entries
3. Runs `bash scripts/impact-graph.sh --files "<estimated files>"` to preview impact
4. Generates a task contract from `docs/contracts/TEMPLATE.md`
5. Asks user for approval
6. Saves to `docs/contracts/YYYY-MM-DD-<topic>.md`

## How to Invoke

Say `/contract` or ask Claude Code to "create a task contract for this work."

## Contract Fields

| Field | Required | Description |
|---|---|---|
| Goal | Yes | One sentence — what this achieves |
| Non-Goals | Yes | What we're NOT doing |
| Modules Touched | Yes | Every file that will change |
| Acceptance Criteria | Yes | Testable pass/fail conditions |
| Rollback Plan | Yes | How to undo |
| Anti-Patterns Checked | Yes | Relevant Learning Journal entries |
| Proof Required | Yes | What evidence to show |

## Example

```markdown
# Task Contract: Add Rate Limiting to /api/costs

**Date:** 2026-03-01
**Maker LLM:** Claude
**Confidence:** HIGH (0.85)

## Goal
Add per-user rate limiting (100 req/min) to the /api/costs endpoint.

## Non-Goals
- Not adding rate limiting to other endpoints
- Not implementing Redis-based distributed rate limiting (in-memory is sufficient for now)

## Modules Touched
- `apps/api/src/routes/costs.ts`
- `apps/api/src/middleware/rate-limit.ts` (new)
- `apps/api/tests/rate-limit.test.ts` (new)

## Acceptance Criteria
- [ ] 101st request within 1 minute returns 429
- [ ] Rate limit headers present (X-RateLimit-Remaining, X-RateLimit-Reset)
- [ ] Existing cost tests still pass

## Rollback Plan
Revert the middleware registration in costs.ts — endpoint returns to unlimited.

## Anti-Patterns Checked
- [ ] Agent timeout = executor timeout (ensure rate limit doesn't interfere with timeout hierarchy)

## Proof Required
- [ ] curl showing 429 after 100 requests
- [ ] Rate limit headers in response
- [ ] Test output showing all pass
```
