---
name: deploy-verify
description: Verify production deployment health — env vars, health endpoints, business transaction smoke tests
disable-model-invocation: true
---

# Deploy Verification

Post-deploy checklist to verify all services are healthy and correctly configured.

## Prerequisites

Requires these env vars (check `.env.example` for full list):
- `NEXT_PUBLIC_API_URL` — API base URL
- Railway and Vercel CLI authenticated

## Steps

### 1. API Health (Railway)

```bash
API_URL="${NEXT_PUBLIC_API_URL:-https://playbook-api-production.up.railway.app}"
curl -sf "$API_URL/api/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'API: {d[\"status\"]}')"
```

- Verify status is `ok` (not `degraded`)
- If degraded: check which subsystems are down (DB, Redis, etc.)

### 2. Web App (Vercel)

```bash
WEB_URL="${NEXT_PUBLIC_WEB_URL:-https://web-beta-eight-23.vercel.app}"
curl -sf -o /dev/null -w '%{http_code}' "$WEB_URL"
```

- Verify HTTP 200
- Verify `NEXT_PUBLIC_API_URL` is set correctly: `vercel env ls --environment production | grep NEXT_PUBLIC_API_URL`

### 3. Admin App (Vercel)

```bash
ADMIN_URL="${NEXT_PUBLIC_ADMIN_URL:-https://admin-one-chi-19.vercel.app}"
curl -sf -o /dev/null -w '%{http_code}' "$ADMIN_URL"
```

- Verify HTTP 200

### 4. Env Var Cross-Check

For each service, verify critical env vars are set (not just present — check they're non-empty):
- API: `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`, `ALLOWED_ORIGINS`, `API_KEYS`
- Web: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`
- Admin: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`

### 5. Business Transaction Smoke

- `GET /api/health` — must return `{ status: "ok" }`
- `GET /api/entries` — must return 200 with JSON array (public route)
- Verify CORS: `curl -H "Origin: $WEB_URL" -I "$API_URL/api/health"` — must include `Access-Control-Allow-Origin`

## Output Format

```
## Deploy Verification — YYYY-MM-DD

| Service  | Health | Notes          |
|----------|--------|----------------|
| API      | OK/FAIL| status: ok     |
| Web      | OK/FAIL| HTTP 200       |
| Admin    | OK/FAIL| HTTP 200       |
| Env vars | OK/FAIL| N missing      |
| CORS     | OK/FAIL| origin matched |
| Smoke    | OK/FAIL| N/N passed     |

**Verdict**: READY / NOT READY
```
