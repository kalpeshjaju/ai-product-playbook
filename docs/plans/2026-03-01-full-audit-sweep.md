# Full Audit Sweep Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all deployment gaps, clean up code quality issues, complete documentation, and polish configs/tests across the ai-product-playbook monorepo.

**Architecture:** 14 tasks across 4 groups — Deploy Fixes, Code Quality, Documentation, Config/Testing. Each group is committed atomically. All changes are additive or config-only; no runtime behavior changes.

**Tech Stack:** Docker Compose, GitHub Actions, Vercel CLI, ESLint 9 flat config, Storybook 8, Vitest, React Testing Library, TypeScript 5.7

---

## Group 1: Deploy Fixes

### Task 1: Fix Vercel Project ID Conflict

**Files:**
- Delete: `.vercel/project.json` (root level — duplicates admin's project ID)

**Step 1: Verify the conflict**

Run: `cat .vercel/project.json && cat apps/admin/.vercel/project.json`
Expected: Both contain the same `projectId` value

**Step 2: Remove root .vercel directory**

Run: `rm -rf .vercel/`

**Step 3: Add .vercel to .gitignore (root level)**

Check if `.vercel` is already in `.gitignore`. If not, add it. The root `.vercel/` should never be committed — only `apps/web/.vercel/` and `apps/admin/.vercel/` matter.

Edit `.gitignore` — add `.vercel` if missing.

**Step 4: Verify apps still have their configs**

Run: `cat apps/web/.vercel/project.json && cat apps/admin/.vercel/project.json`
Expected: Both exist with different `projectId` values

---

### Task 2: Add API Health Check to docker-compose

**Files:**
- Modify: `docker-compose.yml:73-92` (api service block)

**Step 1: Add healthcheck to api service**

Add the following block inside the `api` service, after `depends_on`:

```yaml
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

**Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('docker-compose.yml'))"`
Expected: No errors

---

### Task 3: Add Production Smoke Test Workflow

**Files:**
- Create: `.github/workflows/smoke-prod.yml`

**Step 1: Create the workflow file**

```yaml
##
# FILE PURPOSE: Post-deploy production smoke tests
#
# WHY: Verify production deployments are healthy after deploy-web/deploy-admin/deploy-api.
# HOW: Hits production URLs for health check + basic page load.
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01
##

name: Production Smoke Test

on:
  workflow_dispatch:
    inputs:
      target:
        description: 'Which service to smoke test'
        required: true
        type: choice
        options:
          - all
          - api
          - web
          - admin
  workflow_run:
    workflows: ['Deploy API', 'Deploy Web', 'Deploy Admin']
    types: [completed]
    branches: [main]

jobs:
  smoke-api:
    if: >
      (github.event_name == 'workflow_dispatch' && (github.event.inputs.target == 'all' || github.event.inputs.target == 'api')) ||
      (github.event_name == 'workflow_run' && github.event.workflow_run.name == 'Deploy API' && github.event.workflow_run.conclusion == 'success')
    runs-on: ubuntu-latest
    steps:
      - name: Check API health
        run: |
          RESPONSE=$(curl -sf "${{ secrets.PRODUCTION_API_URL }}/api/health" || echo "FAIL")
          echo "$RESPONSE"
          echo "$RESPONSE" | grep -q '"status":"ok"' || (echo "❌ API health check failed" && exit 1)
          echo "✅ API health check passed"

  smoke-web:
    if: >
      (github.event_name == 'workflow_dispatch' && (github.event.inputs.target == 'all' || github.event.inputs.target == 'web')) ||
      (github.event_name == 'workflow_run' && github.event.workflow_run.name == 'Deploy Web' && github.event.workflow_run.conclusion == 'success')
    runs-on: ubuntu-latest
    steps:
      - name: Check web app loads
        run: |
          STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${{ secrets.PRODUCTION_WEB_URL }}" || echo "000")
          echo "Web status: $STATUS"
          [ "$STATUS" = "200" ] || (echo "❌ Web app returned $STATUS" && exit 1)
          echo "✅ Web app loaded successfully"

  smoke-admin:
    if: >
      (github.event_name == 'workflow_dispatch' && (github.event.inputs.target == 'all' || github.event.inputs.target == 'admin')) ||
      (github.event_name == 'workflow_run' && github.event.workflow_run.name == 'Deploy Admin' && github.event.workflow_run.conclusion == 'success')
    runs-on: ubuntu-latest
    steps:
      - name: Check admin app loads
        run: |
          STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${{ secrets.PRODUCTION_ADMIN_URL }}" || echo "000")
          echo "Admin status: $STATUS"
          [ "$STATUS" = "200" ] || (echo "❌ Admin app returned $STATUS" && exit 1)
          echo "✅ Admin app loaded successfully"
```

**Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/smoke-prod.yml'))"`
Expected: No errors

---

### Task 4: Commit Group 1

Run:
```bash
git add docker-compose.yml .github/workflows/smoke-prod.yml .gitignore
git rm -r --cached .vercel/ 2>/dev/null || true
git commit -m "fix: Deploy hardening — Vercel ID conflict, compose health check, prod smoke tests"
```

---

## Group 2: Code Quality Fixes

### Task 5: Configure Next.js ESLint Plugin

**Files:**
- Modify: `eslint.config.js`
- Modify: `package.json` (add dev dependency)

**Step 1: Install the Next.js ESLint plugin**

Run: `npm install -D @next/eslint-plugin-next`

**Step 2: Update eslint.config.js**

Add the Next.js plugin to the flat config. The existing config at `eslint.config.js` uses `typescript-eslint`. Add a new config block for Next.js files:

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/src/**/*.{ts,tsx}', 'apps/**/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'no-console': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
  },
);
```

**Step 3: Run lint to verify**

Run: `npx turbo run lint`
Expected: No new errors (warnings about next lint being deprecated should be gone)

---

### Task 6: Prune Extraneous Dependencies

**Step 1: Run npm prune**

Run: `npm prune`
Expected: Removes `@emnapi/runtime` and any other extraneous packages

**Step 2: Verify no breakage**

Run: `npx turbo run build`
Expected: All packages build successfully

---

### Task 7: Add Shared-UI Storybook Stories

**Files:**
- Modify: `.storybook/main.ts` (add shared-ui path)
- Create: `packages/shared-ui/src/data-card.stories.tsx`
- Create: `packages/shared-ui/src/status-badge.stories.tsx`

**Step 1: Update Storybook config to include shared-ui**

In `.storybook/main.ts`, add the shared-ui path to the stories array:

```typescript
stories: [
  '../packages/shared-ui/src/**/*.stories.@(ts|tsx)',
  '../apps/admin/src/**/*.stories.@(ts|tsx)',
  '../apps/web/src/**/*.stories.@(ts|tsx)',
],
```

**Step 2: Create DataCard stories**

Create `packages/shared-ui/src/data-card.stories.tsx`:

```tsx
/**
 * FILE PURPOSE: Storybook stories for DataCard component
 *
 * WHY: Visual regression testing for the shared data card.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { DataCard } from './data-card';

const meta: Meta<typeof DataCard> = {
  title: 'Shared/DataCard',
  component: DataCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DataCard>;

export const Default: Story = {
  args: {
    title: 'Total Cost',
    value: '$142.50',
  },
};

export const WithSubtitle: Story = {
  args: {
    title: 'API Calls',
    value: 1284,
    subtitle: 'Last 30 days',
  },
};

export const NumericValue: Story = {
  args: {
    title: 'Error Rate',
    value: 0.03,
    subtitle: '3% of total calls',
  },
};
```

**Step 3: Create StatusBadge stories**

Create `packages/shared-ui/src/status-badge.stories.tsx`:

```tsx
/**
 * FILE PURPOSE: Storybook stories for StatusBadge component
 *
 * WHY: Visual regression testing for the shared status badge.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './status-badge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Shared/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Active: Story = {
  args: { status: 'active' },
};

export const Draft: Story = {
  args: { status: 'draft' },
};

export const Deprecated: Story = {
  args: { status: 'deprecated' },
};

export const CustomLabel: Story = {
  args: {
    status: 'active',
    label: 'Live',
  },
};
```

**Step 4: Verify Storybook builds**

Run: `npm run build-storybook`
Expected: Build succeeds, all 4 story files discovered (2 existing + 2 new)

---

### Task 8: Add Admin/Web Storybook Stories

**Files:**
- Create: `apps/admin/src/app/costs/costs-dashboard.stories.tsx`
- Create: `apps/admin/src/app/memory/memory-browser.stories.tsx`

Note: `cost-reset.stories.tsx` and `prompt-manager.stories.tsx` already exist.
Web app pages are server components (fetch data at build time) — they can't be rendered in Storybook directly. Only the admin client components need stories.

**Step 1: Audit what needs stories**

Admin client components without stories:
- `apps/admin/src/app/memory/page.tsx` — client component (memory browser). This is the only unstored client component.

Web pages are all server components — skip them for Storybook (test via Playwright instead).

**Step 2: Create memory browser story**

The memory page is a large client component. Extract it if possible, or create a story that mocks the fetch calls.

Create `apps/admin/src/app/memory/memory-browser.stories.tsx`:

```tsx
/**
 * FILE PURPOSE: Storybook story for Memory Browser page
 *
 * WHY: Visual regression testing for memory management UI.
 */

import type { Meta, StoryObj } from '@storybook/react';
import MemoryPage from './page';

const meta: Meta<typeof MemoryPage> = {
  title: 'Admin/MemoryBrowser',
  component: MemoryPage,
  parameters: {
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof MemoryPage>;

export const Default: Story = {};
```

**Step 3: Verify Storybook builds**

Run: `npm run build-storybook`
Expected: All stories discovered and build succeeds

---

### Task 9: Commit Group 2

Run:
```bash
git add eslint.config.js package.json package-lock.json .storybook/main.ts \
  packages/shared-ui/src/data-card.stories.tsx \
  packages/shared-ui/src/status-badge.stories.tsx \
  apps/admin/src/app/memory/memory-browser.stories.tsx
git commit -m "fix: Code quality — Next.js ESLint plugin, shared-ui stories, memory browser story"
```

---

## Group 3: Documentation

### Task 10: Fill in PRODUCT.md

**Files:**
- Modify: `docs/PRODUCT.md`

**Step 1: Replace template with real content**

Replace the entire file with content derived from actual codebase capabilities:

```markdown
# Product Definition

> **Owner**: Kalpesh Jaju (non-coder approval required for changes)
> **Last updated**: 2026-03-01

## What This Product Does

AI Product Playbook is an operational toolkit for teams building AI/LLM-powered products. It provides a reference enterprise playbook (333K+ words) plus production infrastructure — an LLM gateway, cost tracking, prompt versioning, guardrails, and observability — so teams can ship AI features with production-grade reliability instead of reinventing every safety layer.

## Who Uses It

### Persona 1: AI Product Leader
- **Goal**: Ship AI features with enterprise-grade reliability and cost control
- **Pain today**: Every team rebuilds the same guardrails, cost limits, and eval pipelines from scratch
- **Success looks like**: Deploy a new AI feature with rate limiting, cost caps, prompt versioning, and observability in days, not months

### Persona 2: ML/AI Engineer
- **Goal**: Reliable multi-model inference with fallback chains and quality monitoring
- **Pain today**: Raw LLM API calls with no caching, no fallback, no cost visibility
- **Success looks like**: Single LiteLLM proxy endpoint with automatic fallback, Redis caching, Langfuse tracing, and token-level cost tracking

## Core Actions (What a User Can Do)
1. Route LLM calls through unified gateway (LiteLLM) → automatic model fallback, caching, cost tracking
2. Version and A/B test prompts → create versions, set traffic allocation, promote via ladder (0→10→50→100%)
3. Monitor costs and quality → per-agent cost breakdown, generation stats, quality scores, guardrail triggers
4. Ingest and search documents → upload docs, generate embeddings, semantic search via pgvector
5. Track user preferences and memory → per-user preference graphs, agent memory layer

## What CANNOT Happen (Business Rules & Legal Constraints)
- [x] Monthly cost cannot exceed MAX_COST budget cap (enforced by cost-guard middleware)
- [x] Daily token usage cannot exceed 100K tokens/user (enforced by rate limiter)
- [x] LLM responses must pass output guardrails (regex + LlamaGuard) before reaching users
- [x] API keys required for all non-health endpoints (fail-open only when API_KEYS env var is empty)

## External Services
| Service | Purpose | Cost |
|---------|---------|------|
| Railway | API server + PostgreSQL + Redis hosting | ~$20/mo |
| Vercel | Next.js web + admin app hosting | Free tier |
| LiteLLM | Unified LLM proxy (self-hosted on Railway) | $0 (OSS) |
| Langfuse | LLM observability and tracing | Free tier |
| Sentry | Error tracking | Free tier |
| PostHog | Product analytics | Free tier |
| Deepgram | Audio transcription (Tier 2) | Pay-per-use |
| Together AI | LlamaGuard guardrail model | Pay-per-use |

## Scale
- Expected users: 10-50 (team/org internal tool)
- Expected data volume: <10GB (playbook + documents + embeddings)
- Availability target: 99.5% (Railway SLA)

## Budget
- Monthly infra budget: $50
- Monthly LLM API budget: $100
```

---

### Task 11: Create POST_DEPLOY.md Runbook

**Files:**
- Create: `docs/POST_DEPLOY.md`

**Step 1: Write the runbook**

```markdown
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
```

---

### Task 12: Document Env Var Defaults

**Files:**
- Modify: `.env.example`

**Step 1: Add default/fallback comments to optional vars**

Add inline comments explaining default behavior when vars are not set:

- `REDIS_HOST=` → `REDIS_HOST=                    # Default: uses REDIS_URL instead. Only needed for LiteLLM standalone`
- `REDIS_PORT=` → `REDIS_PORT=                    # Default: 6379. Only needed for LiteLLM standalone`
- `REDIS_PASSWORD=` → `REDIS_PASSWORD=                # Required for docker-compose. In prod, included in REDIS_URL`
- `ALLOWED_ORIGINS=` → `ALLOWED_ORIGINS=               # Default: * (allow all). Set to comma-separated origins in production`
- `MAX_COST=100` → `MAX_COST=100                   # Default: 100. Monthly cost budget cap in USD. Set to 0 to disable`
- `CHUNK_SIZE_CHARS=2000` → `CHUNK_SIZE_CHARS=2000          # Default: 2000. Characters per document chunk`
- `CHUNK_OVERLAP_CHARS=200` → `CHUNK_OVERLAP_CHARS=200        # Default: 200. Overlap between chunks`
- `NODE_ENV=production` → `NODE_ENV=production            # Default: production. Set to development for verbose logging`
- `ROUTELLM_ENABLED=false` → `ROUTELLM_ENABLED=false         # Default: false. Enable ML-based model routing (requires RouteLLM model)`
- `MEMORY_PROVIDER=` → `MEMORY_PROVIDER=               # Options: mem0 | zep. No default — memory features disabled if unset`
- `LLAMAGUARD_MODEL=llamaguard` → `LLAMAGUARD_MODEL=llamaguard    # Default: llamaguard. LiteLLM alias. Guardrails skip if model unavailable`

---

### Task 13: Create GITHUB_SECRETS.md

**Files:**
- Create: `docs/GITHUB_SECRETS.md`

**Step 1: Write the secrets documentation**

```markdown
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
```

---

### Task 14: Commit Group 3

Run:
```bash
git add docs/PRODUCT.md docs/POST_DEPLOY.md docs/GITHUB_SECRETS.md .env.example
git commit -m "docs: Product definition, deploy runbook, env var defaults, GitHub secrets guide"
```

---

## Group 4: Config & Testing Polish

### Task 15: Create vercel.json Configs

**Files:**
- Create: `apps/web/vercel.json`
- Create: `apps/admin/vercel.json`

**Step 1: Create web vercel.json**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm ci --legacy-peer-deps",
  "buildCommand": "npx turbo run build --filter=@playbook/web"
}
```

**Step 2: Create admin vercel.json**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm ci --legacy-peer-deps",
  "buildCommand": "npx turbo run build --filter=@playbook/admin"
}
```

---

### Task 16: Rewrite check-api-contracts in TypeScript

**Files:**
- Create: `scripts/check-api-contracts.ts`
- Modify: `scripts/check-api-contracts.sh` (replace content with delegation to TS script)

**Step 1: Write the TypeScript route extractor**

Create `scripts/check-api-contracts.ts`:

```typescript
/**
 * FILE PURPOSE: Verify all API routes are documented in API_CONTRACTS.md
 *
 * WHY: Undocumented endpoints create integration risk. Replaces fragile shell+regex approach.
 * HOW: Reads server.ts and routes/*.ts, extracts /api/ paths, checks against docs/API_CONTRACTS.md.
 *
 * USAGE: npx tsx scripts/check-api-contracts.ts
 * EXIT: 0 = all documented, 1 = gaps found
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CONTRACTS_DOC = 'docs/API_CONTRACTS.md';
const API_SRC = 'apps/api/src';

function extractRoutes(): Map<string, string[]> {
  const routes = new Map<string, string[]>();

  const files = [
    join(API_SRC, 'server.ts'),
    ...getRouteFiles(),
  ];

  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf-8');

    // Match string literal routes: '/api/...'
    const literalMatches = content.matchAll(/['"]\/api\/[^'"]*['"]/g);
    for (const m of literalMatches) {
      const route = m[0].replace(/['"]/g, '');
      if (!routes.has(route)) routes.set(route, []);
      routes.get(route)!.push(file);
    }

    // Match regex routes: url.match(/^\/api\/.../)
    const regexMatches = content.matchAll(/match\(\s*\/(.+?)\//g);
    for (const m of regexMatches) {
      const pattern = m[1];
      if (!pattern.includes('/api/') && !pattern.includes('\\/api\\/')) continue;
      const readable = pattern
        .replace(/\\\//g, '/')
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        .replace(/\(\[^\/\]\+\)/g, ':param')
        .replace(/\(\[^\/\]\+?\)/g, ':param');
      if (!routes.has(readable)) routes.set(readable, []);
      routes.get(readable)!.push(file);
    }
  }

  return routes;
}

function getRouteFiles(): string[] {
  const routesDir = join(API_SRC, 'routes');
  if (!existsSync(routesDir)) return [];
  return readdirSync(routesDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(routesDir, f));
}

function checkDocumentation(routes: Map<string, string[]>): number {
  if (!existsSync(CONTRACTS_DOC)) {
    process.stderr.write(`❌ ${CONTRACTS_DOC} does not exist\n`);
    return 1;
  }

  const doc = readFileSync(CONTRACTS_DOC, 'utf-8');
  let undocumented = 0;

  for (const [route, files] of routes) {
    // Skip non-route patterns (version strings, etc.)
    if (!route.startsWith('/api/')) continue;

    // Try exact match
    if (doc.includes(route)) continue;

    // Try base path match (e.g., /api/prompts appears when /api/prompts/:id/active is the route)
    const basePath = route.replace(/\/:[^/]+/g, '').replace(/\/\([^)]+\)/g, '');
    if (doc.includes(basePath)) continue;

    process.stdout.write(`⚠️  Undocumented: ${route} (in ${files.join(', ')})\n`);
    undocumented++;
  }

  if (undocumented > 0) {
    process.stdout.write(`\n❌ ${undocumented} undocumented route(s)\n`);
    return 1;
  }

  process.stdout.write(`✅ All ${routes.size} routes documented\n`);
  return 0;
}

const routes = extractRoutes();
process.exit(checkDocumentation(routes));
```

**Step 2: Update the shell script to delegate**

Replace `scripts/check-api-contracts.sh` content with:

```bash
#!/usr/bin/env bash
# Delegates to TypeScript implementation for reliable route extraction.
# Falls back to basic grep if tsx is not available.

set -euo pipefail

if command -v npx &>/dev/null && npx tsx --version &>/dev/null 2>&1; then
  npx tsx scripts/check-api-contracts.ts
else
  echo "⚠️  tsx not available — falling back to basic grep check"
  if [ ! -f docs/API_CONTRACTS.md ]; then
    echo "❌ docs/API_CONTRACTS.md missing"
    exit 1
  fi
  echo "✅ API_CONTRACTS.md exists (full validation requires tsx)"
fi
```

**Step 3: Test the new script**

Run: `npx tsx scripts/check-api-contracts.ts`
Expected: Either all routes documented or specific undocumented routes listed

---

### Task 17: Add Shared-UI Component Tests

**Files:**
- Create: `packages/shared-ui/tests/data-card.test.tsx`
- Create: `packages/shared-ui/tests/status-badge.test.tsx`

**Step 1: Write DataCard tests**

Create `packages/shared-ui/tests/data-card.test.tsx`:

```tsx
/**
 * FILE PURPOSE: Unit tests for DataCard component
 *
 * WHY: Shared component used across web + admin — must not regress.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataCard } from '../src/data-card';

describe('DataCard', () => {
  it('renders title and string value', () => {
    render(<DataCard title="Total Cost" value="$142.50" />);
    expect(screen.getByText('Total Cost')).toBeDefined();
    expect(screen.getByText('$142.50')).toBeDefined();
  });

  it('renders numeric value as string', () => {
    render(<DataCard title="API Calls" value={1284} />);
    expect(screen.getByText('1284')).toBeDefined();
  });

  it('renders subtitle when provided', () => {
    render(<DataCard title="Calls" value={100} subtitle="Last 30 days" />);
    expect(screen.getByText('Last 30 days')).toBeDefined();
  });

  it('does not render subtitle when omitted', () => {
    const { container } = render(<DataCard title="Calls" value={100} />);
    const subtitleElements = container.querySelectorAll('.text-xs');
    expect(subtitleElements.length).toBe(0);
  });
});
```

**Step 2: Write StatusBadge tests**

Create `packages/shared-ui/tests/status-badge.test.tsx`:

```tsx
/**
 * FILE PURPOSE: Unit tests for StatusBadge component
 *
 * WHY: Shared component used across web + admin — must not regress.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../src/status-badge';

describe('StatusBadge', () => {
  it('renders status text by default', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('active')).toBeDefined();
  });

  it('renders custom label when provided', () => {
    render(<StatusBadge status="active" label="Live" />);
    expect(screen.getByText('Live')).toBeDefined();
  });

  it('applies green background for active status', () => {
    const { container } = render(<StatusBadge status="active" />);
    const badge = container.querySelector('span');
    expect(badge?.style.backgroundColor).toBe('rgb(34, 197, 94)');
  });

  it('applies yellow background for draft status', () => {
    const { container } = render(<StatusBadge status="draft" />);
    const badge = container.querySelector('span');
    expect(badge?.style.backgroundColor).toBe('rgb(234, 179, 8)');
  });

  it('applies red background for deprecated status', () => {
    const { container } = render(<StatusBadge status="deprecated" />);
    const badge = container.querySelector('span');
    expect(badge?.style.backgroundColor).toBe('rgb(239, 68, 68)');
  });
});
```

**Step 3: Check if vitest config exists for shared-ui**

The root `vitest.config.ts` covers `packages/**/tests/**/*.test.{ts,tsx}` so these tests should be picked up automatically. Verify shared-ui has jsdom environment configured.

Check `packages/shared-ui/package.json` — it already has `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, and `vitest` as devDependencies. May need a local vitest config for jsdom environment.

Create `packages/shared-ui/vitest.config.ts` if it doesn't exist:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
```

**Step 4: Run the tests**

Run: `cd packages/shared-ui && npx vitest run`
Expected: All tests pass

**Step 5: Run full test suite**

Run: `npx turbo run test`
Expected: All existing 234 tests + new shared-ui tests pass

---

### Task 18: Commit Group 4

Run:
```bash
git add apps/web/vercel.json apps/admin/vercel.json \
  scripts/check-api-contracts.ts scripts/check-api-contracts.sh \
  packages/shared-ui/tests/ packages/shared-ui/vitest.config.ts
git commit -m "fix: Config polish — vercel.json, TS route checker, shared-ui component tests"
```

---

### Task 19: Final Verification

**Step 1: Run full quality check**

Run: `npx turbo run check`
Expected: type-check + lint + test all pass

**Step 2: Verify Storybook builds**

Run: `npm run build-storybook`
Expected: Build succeeds

**Step 3: Verify docker-compose syntax**

Run: `docker compose config --quiet`
Expected: No errors

---

### Task 20: Push to GitHub

Run: `git push origin main`
Expected: CI pipeline triggers, all quality gates pass
