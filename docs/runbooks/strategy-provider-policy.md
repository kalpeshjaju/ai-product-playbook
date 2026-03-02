# Runbook: Strategy Provider Strictness Policy

> Governs production behavior for strategy integrations: Composio, OpenPipe, Memory.

## Policy

- Production mode is `strict` for strategy providers.
- Fail-open mode is only allowed as break-glass, time-boxed, and incident-tracked.
- Break-glass must be explicitly enabled with `STRATEGY_PROVIDER_ALLOW_OPEN_IN_PRODUCTION=true`.

## Ownership

- Primary owner: Platform/API owner (Kalpesh Jaju).
- Secondary owner: On-call engineer handling production incidents.
- Approval required for break-glass: primary owner or delegated incident commander.

## Environment Defaults

- Railway (`playbook-api`, production):
  - `STRATEGY_PROVIDER_MODE=strict`
  - `STRATEGY_PROVIDER_ALLOW_OPEN_IN_PRODUCTION=false`
- GitHub Actions:
  - Smoke pipeline enforces Langfuse live gate with `LANGFUSE_LIVE_REQUIRED=true`.

## Break-Glass Procedure (Production)

1. Open an incident entry with start timestamp and reason.
2. Set `STRATEGY_PROVIDER_MODE=open`.
3. Set `STRATEGY_PROVIDER_ALLOW_OPEN_IN_PRODUCTION=true`.
4. Redeploy API service.
5. Add a rollback deadline (max 24h from change).
6. Restore strict mode:
   - `STRATEGY_PROVIDER_MODE=strict`
   - `STRATEGY_PROVIDER_ALLOW_OPEN_IN_PRODUCTION=false`
7. Close incident with root cause and prevention action.

## Verification Checklist

1. `GET /api/health` returns 200.
2. Strategy routes return expected behavior for missing providers:
   - strict mode: 503 with provider unavailable payload
   - open mode: 200 with `{ enabled: false, ... }`
3. `smoke-prod` API job passes `Verify Langfuse live endpoint`.
4. CI gate `check-strategy-provider-policy.sh` passes.

## Audit Notes (2026-03-02)

- Railway production variables set:
  - `STRATEGY_PROVIDER_MODE=strict`
  - `STRATEGY_PROVIDER_ALLOW_OPEN_IN_PRODUCTION=false`
- GitHub repo variable set:
  - `LANGFUSE_LIVE_REQUIRED=true`
- GitHub secrets verified/present:
  - `PRODUCTION_LANGFUSE_HOST`
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
