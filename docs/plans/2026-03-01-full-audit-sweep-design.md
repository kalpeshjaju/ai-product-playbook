# Full Audit Sweep — Deploy Hardening + Code Quality

> **Date**: 2026-03-01
> **Owner**: Kalpesh Jaju
> **Goal**: Fix all deployment gaps, clean up code quality issues, complete documentation, and polish configs/tests.
> **Scope**: 14 tasks across 4 categories (Deploy, Quality, Docs, Config/Testing)

## Context

Audited the full monorepo. Findings:
- **Deploys 85% production-ready** — Docker, Railway, CI/CD solid. Gaps: Vercel project ID conflict, missing docker-compose health check, no prod E2E.
- **Code quality very clean** — All type-checks, lint, builds, 234 tests pass. Gaps: Missing Storybook stories, Next.js ESLint plugin not configured, 1 extraneous dep.
- **Docs incomplete** — PRODUCT.md still template. No deployment runbook. Env var defaults undocumented.

## Tasks

### Deploy Fixes

| # | Task | Details |
|---|------|---------|
| 1 | Fix Vercel project ID conflict | Remove root `.vercel/project.json` (duplicates admin's ID) |
| 2 | Add API health check to docker-compose | Add healthcheck block to api service (curl /api/health, 30s interval, 3 retries) |
| 3 | Add prod E2E smoke test workflow | `.github/workflows/smoke-prod.yml` — hits production URLs post-deploy |

### Code Quality Fixes

| # | Task | Details |
|---|------|---------|
| 4 | Configure Next.js ESLint plugin | Add `@next/eslint-plugin-next` to root `eslint.config.js` |
| 5 | Prune extraneous dependency | `npm prune` to remove undeclared `@emnapi/runtime` |
| 6 | Add shared-ui Storybook stories | `data-card.stories.tsx`, `status-badge.stories.tsx` + update `.storybook/main.ts` |
| 7 | Add admin/web Storybook stories | Stories for key pages/components lacking coverage |

### Documentation

| # | Task | Details |
|---|------|---------|
| 8 | Fill in PRODUCT.md | Real product definition based on actual codebase capabilities |
| 9 | Create POST_DEPLOY.md | Step-by-step verification checklist per service |
| 10 | Document env var defaults | Inline comments in `.env.example` for optional var fallbacks |
| 11 | Create GITHUB_SECRETS.md | All required CI/CD secrets with setup instructions |

### Config & Testing Polish

| # | Task | Details |
|---|------|---------|
| 12 | Create vercel.json configs | Explicit build settings for `apps/web` and `apps/admin` |
| 13 | Rewrite check-api-contracts in TS | Replace fragile shell+Python regex with TypeScript route extraction |
| 14 | Add shared-ui component tests | Unit tests for DataCard and StatusBadge in `packages/shared-ui/tests/` |

## Approach

- Approach C (Full Audit Sweep) selected by user
- Prioritize deploy fixes first, then quality, docs, config/testing
- Commit after each logical group
- Run full test suite (`turbo run check`) after all changes

## Success Criteria

- All 14 tasks completed
- `turbo run check` passes (type-check + lint + test)
- Docker compose `docker compose up` starts all services with health checks
- No template placeholders in PRODUCT.md
- Storybook renders all shared-ui components
