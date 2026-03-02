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

- **NEVER commit directly to main.** Always create a feature branch first (`claude/<topic>`, `codex/<topic>`, etc.). A pre-commit hook blocks commits to main. Merge via PR or fast-forward after CI passes.
- **Use git worktrees for isolation.** Multiple LLMs/terminals share this repo. If you don't use a worktree, another session's `git checkout` will silently switch your branch. Run `git worktree add .claude/worktrees/<name> -b <branch>` or use the worktree skill.
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

**admin**: `/` (Users) | `/prompts` (Prompts) | `/costs` (Costs) | `/memory` (Memory) | `/moat-health` (Moat Health)

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

---

## LLM Coding Framework (6 Pillars)

> Every LLM (Claude, Codex, Cursor, Gemini) must follow this framework.
> These are not suggestions — they are enforced by git hooks, CI, and CodeRabbit.

### Pillar 1: Task Contract (before coding)

Before writing any code, produce or verify a task contract:
- **Goal**: One sentence — what this achieves
- **Non-Goals**: What this explicitly does NOT do
- **Modules Touched**: Every file/directory that will be modified
- **Acceptance Criteria**: Testable conditions that prove the task is done
- **Rollback Plan**: How to undo if it breaks production
- **Anti-Patterns Checked**: Which entries from `docs/LEARNING_JOURNAL.md` are relevant

Template: `docs/contracts/TEMPLATE.md`. Save contracts to `docs/contracts/YYYY-MM-DD-<topic>.md`.

If the user's request doesn't include a contract, generate one and get approval before coding.

**Small change exemption:** If a PR touches 2 or fewer files AND intent is DOCS or BUGFIX, inline the contract in the PR body (skip the `docs/contracts/` file) and skip impact graph (not needed for 1-2 files).

### Pillar 2: Change Impact Graph (before and after coding)

Before pushing, run: `bash scripts/impact-graph.sh`

This maps your changed files to:
- **Must-run tests** (which test suites are affected)
- **High-risk areas** (auth, data, shared packages, etc.)
- **Review checklist** (what the reviewer must verify)

Run the must-run tests before pushing. The pre-push hook runs this automatically. CI posts impact analysis as a PR comment.

### Pillar 3: Context Pack (before coding)

Before implementation, retrieve and read:
1. This file (`CLAUDE.md`)
2. `docs/LEARNING_JOURNAL.md` — at minimum the Anti-Pattern Registry table
3. Relevant test files for modules you're about to touch
4. Recent `docs/feedback/*.json` events for the modules you're touching

Do NOT code without reading the anti-pattern registry. This is enforced by the Learning Journal protocol in memory.

### Pillar 4: Two-Layer Validation (during and after coding)

**Layer A (fast, every commit):**
- Type-check: `npx turbo run type-check`
- Lint: `npx turbo run lint`
- Impacted unit tests (from impact graph)

**Layer B (full, every push/PR):**
- Full test suite: `npx turbo run test`
- Build: `npx turbo run build`
- Contract tests: `npm run test:contract`
- E2E (if UI changed): `npm run test:e2e:fullstack`
- Hallucination check (CI runs automatically)

Pre-push hook enforces Layer B. CI enforces both layers.

### Pillar 5: Anti-Fake Outputs (always)

**No claimed behavior without evidence.**

- Every PR must have a `## Proof` section with real execution output
- `curl` output for API changes, test output for logic changes, screenshots for UI changes
- Confidence score required: VERIFIED (0.95) / HIGH (0.85) / MEDIUM (0.70) / LOW (0.40)
- Below 0.70 triggers mandatory cross-LLM review
- CodeRabbit is configured to flag: stub returns, empty catches, hallucinated imports, raw `JSON.parse()` on LLM output

### Pillar 6: Memory + Recurrence (after every session/PR)

**Every failure becomes a permanent check.**

1. **Session level**: Run `/reflect` at end of meaningful sessions — updates Learning Journal
2. **PR level**: CI failures and CodeRabbit findings are captured to `docs/feedback/*.json` via `scripts/capture-feedback.sh`
3. **Escalation**: When a root-cause bucket hits 3+ occurrences — `scripts/scan-escalations.sh` flags it — convert to ESLint rule, CI check, or hook

The goal: an empty anti-pattern registry — not because we stopped finding problems, but because every problem became an automated check.

### Maker-Checker Model

| Role | Who | When |
|---|---|---|
| **Maker** | Any LLM | Writes code |
| **Auto-Checker** | CodeRabbit | Every PR, automatic |
| **Gate Enforcer** | Git hooks + CI | Every commit/push/PR |
| **Cross-Checker** | Different LLM than maker | Confidence < 0.70 or high-risk area |
| **Memory Keeper** | `/reflect` skill | End of session |

Branch naming convention for maker detection: `claude/feature-name`, `codex/feature-name`, `cursor/feature-name`, `gemini/feature-name`.

The multi-LLM review workflow (`.github/workflows/multi-llm-review.yml`) detects the maker LLM from branch name or Co-Authored-By and suggests a different reviewer.
