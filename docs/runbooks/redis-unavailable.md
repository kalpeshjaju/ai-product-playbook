# Runbook: Redis Unavailable

> When Redis is down or unreachable. Affects rate limiting and token budgets.

## Symptoms

- `/api/health` returns `"status":"degraded"` with `services.redis: "error"`
- Rate limiter logs: "Redis unavailable, failing open" (dev) or "failing closed" (prod)
- In production: all LLM requests get 429 (rate limiter fails closed)
- In dev: rate limiting silently bypassed

## Impact Assessment

| Component | Behavior when Redis down |
|-----------|------------------------|
| Rate limiter (`rate-limiter.ts`) | **Production**: fails closed (429 all requests). **Dev**: fails open |
| Token budget tracking | Lost — sliding window resets on reconnect |
| Health endpoint | Reports `degraded` (not `error` — DB is still primary) |
| LiteLLM proxy | Has its own Redis — check separately on Railway |

## LLM Action

1. Check Railway dashboard → Redis service status
2. Check `REDIS_URL` env var is correctly set on API service
3. If Redis crashed: click **Restart** in Railway dashboard
4. If Redis OOM: check memory usage, consider upgrading plan or flushing stale keys
5. Verify: `GET /api/health` returns `services.redis: "ok"`

## Non-Coder Action

1. Open Railway dashboard → check Redis service
2. If "Crashed" → click **Restart**
3. Wait 2 minutes → check `/api/health`
4. If still down → escalate to Railway support

## Escalation

- Railway support: support@railway.app
- Consider: temporarily switch `rate-limiter.ts` to fail-open in production (requires code change + deploy)

## Recovery Verification

1. `GET /api/health` → `services.redis: "ok"`
2. Make an authenticated LLM request → should succeed (not 429)
3. Make 2+ requests → verify rate limit counter is incrementing (not reset)

## Post-Mortem

- Log in `docs/INCIDENTS.md`
- If OOM: add Redis memory monitoring alert
- If connection issue: verify `REDIS_URL` includes password and correct port
- Consider: should production fail-open instead of fail-closed? (trade-off: availability vs. cost protection)
