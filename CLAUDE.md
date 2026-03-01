# AI Product Playbook — LLM Development Guide

> **Source of truth for all LLMs working on this project.**
> Claude, Cursor, Gemini, GPT, Codex — everyone reads this file.

## Project

- **What**: Tools and products built around the LLM-Maintained Enterprise Playbook
- **Owner**: Kalpesh Jaju
- **Stack**: See `docs/MOAT-STACK-SETUP.md` for the moat stack (Promptfoo, Composio, Inception, Langfuse, LiteLLM, prompt versioning + A/B).

## Working Principles

- **Verify before summarizing**: When analyzing this codebase, do NOT speculate about what tools, integrations, or features exist. Always read config files, env vars, and actual code before summarizing the project's capabilities. Never guess based on common patterns — check the source.
- **Test incrementally**: After editing any 2-3 files, run the relevant test suite before continuing. If tests fail, fix them before moving to the next file. Never batch more than 3 file edits without a test checkpoint.
- **Keep exploration concise**: When asked for a plan or analysis, deliver a structured written artifact within 2-3 minutes of exploration. Do not do exhaustive codebase walks unless explicitly asked.

## Rules

- Push to GitHub after every implementation
- Include confidence scores on technical recommendations
- Ask for clarification when requirements are ambiguous
- Use explicit types, no `any` — prefer `unknown`
- Never commit console.log, commented-out code, or unused imports
- Write code so any LLM can understand it instantly (clear names, comments on non-obvious logic)

## Conventions

- Keep files under 400 lines, functions under 75 lines
- Every file gets a top-level comment: what it does, why it exists
- Error messages must include context (what failed, where, why)
- No `any` types — use `unknown` with type guards

## Git Workflow

- This repo has pre-push hooks and linter hooks. Before committing: (1) stash any untracked/modified test artifacts, (2) run the linter, (3) then commit and push. Anticipate hook failures — don't be surprised by them.
- When the user says "commit and push" or "ship it", use a single streamlined flow: stage → commit with descriptive message → push. Do not over-explore or re-audit the codebase. If a `/ship` skill exists, use it.

## Deployment Checklist

- Before deploying, verify all dependencies are in `package.json` / `requirements.txt`. Run a clean install (`npm ci` / `pip install -r requirements.txt`) to catch missing deps before they cause silent production failures.
- Always ensure env vars match across Railway and Vercel — especially API keys. Check actual deployed values, not just `.env` files.

## Scripting Conventions

- Prefer Python over shell for anything non-trivial
- Account for macOS bash 3.2 limitations (no associative arrays, no `[[` in sh mode)
- Handle rate limiting from external APIs and pipe truncation for large outputs

## Codebase Navigation Map

Turborepo monorepo. All apps share `@playbook/shared-types` and `@playbook/shared-ui`.

### Apps

| App | Path | Purpose | Nav pattern |
|-----|------|---------|-------------|
| **admin** | `apps/admin/` | Admin panel (deploy target: Vercel) | Fixed left sidebar (`NAV_ITEMS` in `layout.tsx`) |
| **alexa** | `apps/alexa/` | Alexa skill (deploy target: AWS Lambda) | **Stub — not yet implemented** |
| **api** | `apps/api/` | Shared backend API (deploy target: Railway) | — |
| **mobile** | `apps/mobile/` | Mobile app — iOS + Android (deploy target: Expo/EAS or direct) | **Stub — not yet implemented** |
| **web** | `apps/web/` | Desktop web app (deploy target: Vercel) | Sticky top navbar (`NAV_ITEMS` in `layout.tsx`) |

### Routes

**admin**: `/` (Users) | `/prompts` (Prompts) | `/costs` (Costs) | `/memory` (Memory)

**web**: `/` (Home) | `/prompts` (Prompts) | `/costs` (Costs)

### Key file locations per app

```
apps/{web,admin}/
├── src/app/layout.tsx      ← Root layout, nav config (NAV_ITEMS array), auth gating
├── src/app/page.tsx        ← Home route
├── src/app/*/page.tsx      ← Feature routes (prompts, costs, memory)
├── src/components/         ← Shared UI (NavLink for active-state highlighting)
├── src/providers/          ← Context providers (PostHog, Clerk)
├── src/hooks/              ← Custom hooks
└── src/middleware.ts       ← Clerk route middleware

apps/api/
├── src/                    ← API server source
├── drizzle/               ← Database migrations
└── tests/                 ← API tests
```

### Services & packages

| Path | What |
|------|------|
| `services/crawl4ai/` | crawl4ai |
| `services/dspy/` | dspy |
| `services/litellm/` | litellm |
| `services/strapi/` | Strapi CMS — headless content management for playbook product |
| `packages/shared-llm/` | LLM resilience patterns — JSON extraction, cost tracking, fallback monitoring |
| `packages/shared-types/` | Shared TypeScript types and interfaces across all apps |
| `packages/shared-ui/` | Shared UI components (web + admin reuse) |

### Navigation conventions

- Both web and admin apps use a `NAV_ITEMS` config array in `layout.tsx` — add new routes there
- Active link highlighting via `NavLink` client component (`src/components/nav-link.tsx`)
- All routing is Next.js App Router file-system based — no external router library
- To add a new page: create `src/app/{route}/page.tsx` + add entry to `NAV_ITEMS`

## For New LLMs Joining

1. Read this file first
2. Read `LLM-MAINTAINED-ENTERPRISE-PLAYBOOK.md` for the philosophy
3. Read `docs/LEARNING_JOURNAL.md` (at minimum the Anti-Pattern Registry at the bottom)
4. Check git log for recent context
5. Ask if anything is unclear — don't guess
