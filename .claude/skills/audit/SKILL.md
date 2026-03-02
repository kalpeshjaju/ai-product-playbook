---
name: audit
description: Run full codebase health check — type-check, lint, test, build, E2E — and report scorecard
---

# Full Codebase Audit

Run every gate in sequence, collect results, and produce a scorecard.

## Steps

1. **Type-check**: `npm run type-check` — report pass/fail per workspace
2. **Lint**: `npm run lint` — report pass/fail per workspace
3. **Unit tests**: `npm run test` — report test counts and any failures
4. **Build**: `npm run build` — report pass/fail, note build warnings
5. **E2E tests**: `npm run test:e2e` — report pass/fail count
6. **Contract tests** (if DB available): `npm run test:contract` — report or note "skipped (no DB)"

## Output Format

```
## Audit Scorecard — YYYY-MM-DD

| Gate           | Result    | Details                    |
|----------------|-----------|----------------------------|
| type-check     | PASS/FAIL | X/Y workspaces             |
| lint           | PASS/FAIL | X/Y workspaces             |
| unit tests     | PASS/FAIL | X passed, Y failed (Z total) |
| build          | PASS/FAIL | X/Y workspaces             |
| E2E            | PASS/FAIL | X passed, Y failed         |
| contract       | PASS/FAIL/SKIP | details              |

**Overall**: PASS / FAIL (N issues)
**Blockers**: [list any P0/P1 failures]
```

## Rules

- Run each gate even if a previous one fails — report all issues, not just the first
- Do NOT fix anything during audit — report only
- If a gate times out, report "TIMEOUT" not "FAIL"
- Include actual command output snippets for any failures
