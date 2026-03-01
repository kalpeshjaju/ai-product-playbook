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
| `RAILWAY_TOKEN` | deploy-api | Railway Dashboard → Project → Settings → Tokens |

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
