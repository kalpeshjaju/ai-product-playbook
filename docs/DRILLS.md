# Rollback & Recovery Drills

> Track drill results over time. Each drill validates that recovery procedures work.
> Drills are append-only — never delete results, even failures.
> Last updated: 2026-03-02

---

## Drill Types

| Drill | Frequency | Script | Pass Criteria |
|-------|-----------|--------|---------------|
| **Code rollback** | Monthly | `scripts/rollback-drill.sh` (planned) | Detection < 2 min, recovery < 5 min |
| **Data restore** | Quarterly | Manual (Railway backup restore) | RTO < 2h, data integrity checks pass |
| **Redis failover** | Quarterly | Kill Redis → verify fail-open → restart | API continues serving (degraded), recovers on reconnect |

---

## Drill Log

### No drills conducted yet

**Next scheduled**: Code rollback drill — target March 2026

**Prerequisites before first drill**:
1. Staging environment on Railway (or use a feature branch deploy)
2. `scripts/rollback-drill.sh` script created
3. Smoke test can run against staging URL

---

## Drill Result Template

```markdown
### DRILL-NNN: [Type] — [YYYY-MM-DD]
**Environment**: staging | production-safe
**Procedure**:
1. [Step taken]
2. [Step taken]
**Detection time**: Xm Ys
**Recovery time**: Xm Ys
**Result**: PASS | FAIL
**Issues found**: [Any problems encountered]
**Action items**: [Improvements to make]
```

---

<!-- Append drill results above this line -->
