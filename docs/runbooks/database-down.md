# Runbook: Database Down

> When Postgres is unreachable or returning errors.

## Symptoms

- API returns 500 errors on data routes
- `/api/health` returns `503` with `services.database: "error"`
- Logs show "connection refused", "too many connections", or "ECONNRESET"
- Sentry alerts spike with database-related errors

## LLM Action (automated or next-session)

1. Check Railway dashboard → Postgres service status
2. Check connection pool settings in `DATABASE_URL`
3. Review recent migrations (`drizzle/` directory) for destructive changes
4. Restart Postgres service if unresponsive: Railway dashboard → service → Restart
5. Verify: `curl $API_URL/api/health` returns `services.database: "ok"`

## Non-Coder Action

1. Check email/Slack for Railway alerts
2. Open Railway dashboard → check Postgres service status
3. If status shows "Crashed" or "Unreachable" → click **Restart**
4. If restart doesn't help within 5 minutes → contact Railway support
5. Verify: visit `$API_URL/api/health` in browser — should show `"status":"ok"`

## Escalation

- Railway support: support@railway.app (or dashboard chat)
- Response time: ~1 hour for critical issues

## Recovery Verification

1. `GET /api/health` → `{"status":"ok","services":{"database":"ok"}}`
2. `GET /api/costs` with auth → returns data (confirms read path)
3. Check Sentry for new errors in the last 15 minutes
4. Verify no data loss: check latest `ai_cost_events` timestamps

## Post-Mortem

- Log in `docs/INCIDENTS.md` with root cause
- If caused by migration: add rollback migration + test case
- If caused by connection exhaustion: review pool size in DATABASE_URL
