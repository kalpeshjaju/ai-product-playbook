# GitHub Secrets Configuration

> All secrets required for CI/CD pipelines.
> Configure at: Settings → Secrets and variables → Actions

## Required for All Deploys

| Secret | Used By | How to Get |
|--------|---------|------------|
| `VERCEL_TOKEN` | deploy-web, deploy-admin | Vercel Dashboard → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | deploy-web, deploy-admin | `vercel whoami` or Vercel Dashboard → Settings → General |
| `VERCEL_WEB_PROJECT_ID` | deploy-web | `cat apps/web/.vercel/project.json` → `projectId` field |
| `VERCEL_ADMIN_PROJECT_ID` | deploy-admin | `cat apps/admin/.vercel/project.json` → `projectId` field |
| `RAILWAY_TOKEN` | deploy-api, deploy-litellm | Railway Dashboard → Project → Settings → Tokens |

## Required for CI Tests

| Secret | Used By | How to Get |
|--------|---------|------------|
| `GITGUARDIAN_API_KEY` | ci (security job) | GitGuardian Dashboard → API → Personal Access Tokens |

## Required for Production Smoke Tests

| Secret | Used By | How to Get |
|--------|---------|------------|
| `PRODUCTION_API_URL` | smoke-prod | Railway deployment URL (e.g., `https://playbook-api.up.railway.app`) |
| `PRODUCTION_WEB_URL` | smoke-prod | Vercel production URL for web app |
| `PRODUCTION_ADMIN_URL` | smoke-prod | Vercel production URL for admin app |
| `PRODUCTION_LANGFUSE_HOST` | smoke-prod (Langfuse live gate) | Langfuse host URL (e.g., `https://cloud.langfuse.com`) |
| `LANGFUSE_PUBLIC_KEY` | smoke-prod (Langfuse live gate) | Langfuse Project → API Keys |
| `LANGFUSE_SECRET_KEY` | smoke-prod (Langfuse live gate) | Langfuse Project → API Keys |

## Required for Strategy Flywheel Workflow

| Secret | Used By | How to Get |
|--------|---------|------------|
| `API_URL` | strategy-flywheel | Production API URL (`PRODUCTION_API_URL` value) |
| `API_KEY` | strategy-flywheel | Valid API key accepted by `API_KEYS`/`API_INTERNAL_KEY` |
| `ADMIN_API_KEY` | strategy-flywheel | Admin key configured on API service |

## Optional Variables (Actions → Variables)

| Variable | Used By | Default |
|----------|---------|---------|
| `LANGFUSE_LIVE_REQUIRED` | smoke-prod (Langfuse live gate) | `true` |
| `FLYWHEEL_TASK_TYPES` | strategy-flywheel | `summarization,classification` |
| `FLYWHEEL_MIN_QUALITY_SCORE` | strategy-flywheel | `0.85` |
| `FLYWHEEL_BUILD_LIMIT` | strategy-flywheel | `20` |
| `FLYWHEEL_INFER_ALL_LIMIT` | strategy-flywheel | `100` |
| `FLYWHEEL_INFER_MIN_FEEDBACK_COUNT` | strategy-flywheel | `3` |
| `FLYWHEEL_USER_IDS` | strategy-flywheel | unset (uses `/api/preferences/infer-all`) |
| `PROMOTION_PROMPT_NAMES` | prompt-promotion-loop | required (comma-separated prompt names) |
| `PROMOTION_LOOKBACK_DAYS` | prompt-promotion-loop | `7` |
| `PROMOTION_MIN_SAMPLES` | prompt-promotion-loop | `20` |
| `PROMOTION_MIN_ACCEPTANCE_RATE` | prompt-promotion-loop | `0.75` |
| `PROMOTION_MIN_CONVERSION_RATE` | prompt-promotion-loop | `0.08` |
| `PROMOTION_ROLLBACK_MAX_ACCEPTANCE_RATE` | prompt-promotion-loop | `0.55` |
| `PROMOTION_ROLLBACK_MAX_CONVERSION_RATE` | prompt-promotion-loop | `0.02` |

## Optional (Tier 2/3 Eval Workflows)

| Secret | Used By | How to Get |
|--------|---------|------------|
| `LITELLM_PROXY_URL` | promptfoo-eval | Railway LiteLLM service URL |
| `LITELLM_API_KEY` | promptfoo-eval | Same as LITELLM_MASTER_KEY |
| `BRAINTRUST_API_KEY` | braintrust-eval | Braintrust Dashboard → Settings → API Keys |

## Environment: production

Some workflows require the `production` environment to be configured in GitHub:
Settings → Environments → New environment → Name: `production`

Optional: Add required reviewers for deploy-api (recommended).
