# Post-Deploy Verification Runbook

> Run these checks after every production deploy.
> Automated smoke tests in `.github/workflows/smoke-prod.yml` cover items 1-3.

## API (Railway)

1. **Health check**: `curl https://<api-url>/api/health`
   - Expected: `{"status":"ok","services":{"database":"ok"}}`
   - If degraded: Check Railway logs, verify DATABASE_URL is correct

2. **Auth gate**: `curl https://<api-url>/api/entries` (no API key)
   - Expected: 401 if API_KEYS is set, 200 if fail-open mode

3. **Rate limiter**: Check Redis connectivity via health endpoint
   - If health shows degraded: Verify REDIS_URL env var on Railway

## Web App (Vercel)

4. **Page load**: Visit production URL
   - Expected: Homepage renders with playbook entries
   - If blank: Check Vercel deployment logs, verify NEXT_PUBLIC_* env vars

5. **Sentry**: Check Sentry dashboard for new errors post-deploy
   - Expected: No new error spikes

## Admin App (Vercel)

6. **Page load**: Visit admin production URL
   - Expected: Dashboard renders with user table

7. **Costs page**: Navigate to /costs
   - Expected: Cost summary cards render (may show zeros if fresh deploy)

## Observability

8. **Langfuse**: Check traces dashboard for recent traces
   - Expected: New traces appear within 5 minutes of API traffic

9. **PostHog**: Check events dashboard
   - Expected: Page view events from web/admin apps
