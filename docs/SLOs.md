# Service Level Objectives

> Plain-English reliability targets + technical translations.
> Reviewed by: LLM (author) + project owner (reviewer).
> Last updated: 2026-03-02

---

## SLO Definitions

| Plain English | Technical SLO | Enforcement | Status |
|---------------|---------------|-------------|--------|
| "API works 99.5% of the time" | 99.5% uptime (≤ 3.6 hrs downtime/month) | `smoke-prod.yml` health check + Railway uptime monitoring | ACTIVE |
| "Pages load in 2 seconds" | p95 latency < 2000ms | `load-test.yml` k6 thresholds (`http_req_duration{p(95)} < 2000`) | ACTIVE |
| "LLM calls return in 10 seconds" | p95 LLM latency < 10000ms | Langfuse trace duration alerts (when configured) | PLANNED |
| "Health endpoint responds fast" | `/api/health` p99 < 500ms | k6 smoke test | ACTIVE |
| "No budget overruns" | Monthly LLM spend ≤ `MAX_COST` env var | `cost-guard.ts` pre-call check returns 429 at budget cap | ACTIVE |
| "Rate limits protect the API" | Token budget ≤ 100K tokens/user/24h | `rate-limiter.ts` Redis sliding window | ACTIVE |

---

## Error Budget

**Monthly allowance**: 0.5% = **3.6 hours** downtime per month.

```
Budget calculation:
  Total minutes/month:  43,200 (30 days)
  Allowed downtime:     216 minutes (3.6 hours)
  Current tracking:     Manual (Railway uptime dashboard)
```

**Freeze rule**: When error budget < 20% remaining (~43 min left):
- Block `feat/*` branch PRs (reliability-only mode)
- Allow `fix/*`, `hotfix/*`, `docs/*`, `chore/*` branches
- Enforcement: Not yet automated (manual review until monitoring matures)

---

## Disaster Recovery Targets

| Target | Value | Justification |
|--------|-------|---------------|
| **RPO** (max data loss) | ≤ 24 hours | Railway Postgres daily backups (free tier). Upgrade to PITR for tighter RPO |
| **RTO** (max restore time) | ≤ 4 hours (current) → 2 hours (target by Q3 2026) | Solo dev with Railway managed restore. Manual steps documented in `runbooks/data-corruption.md` |
| **Backup frequency** | Daily (Railway automatic) | Covers RPO. Verify via Railway dashboard monthly |
| **Backup verification** | Quarterly restore drill | Logged in `docs/DRILLS.md` |

---

## Monitoring Stack (Current)

| Layer | Tool | What it checks |
|-------|------|----------------|
| **Uptime** | `smoke-prod.yml` (CI cron + post-deploy) | `/api/health` → DB + Redis + LiteLLM |
| **Load** | `load-test.yml` (manual trigger) | k6 smoke/full scenarios with latency thresholds |
| **Cost** | `cost-guard.ts` + `ai_cost_events` table | Per-request budget enforcement + monthly ledger |
| **Security** | GitGuardian + Semgrep + audit-with-allowlist | Secrets, SAST, dependency vulns |
| **Errors** | Sentry (`SENTRY_DSN`) | Runtime exceptions, breadcrumbs |
| **LLM Observability** | Langfuse (`LANGFUSE_*`) | Traces, prompt versions, token costs |

### Not yet configured (roadmap)

- PagerDuty / Slack alerting on smoke test failure
- Datadog RUM + APM (planned per tooling strategy)
- Error budget automation (GitHub Actions variable + CI gate)
