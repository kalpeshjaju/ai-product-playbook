# Project Audit

**Date:** 2026-03-01 (redo)  
**Scope:** Health checks, type safety, conventions, deployment readiness, and playbook alignment.

---

## 1. Status summary

| Area | Status | Details |
|------|--------|---------|
| Git | Modified | 3 modified (playbook, 2× tsconfig.tsbuildinfo), 2 untracked (`PLAYBOOK-VALIDATION-REPORT.md`, `PROJECT-AUDIT.md`) |
| Tests | Pass | 5/5 tasks (shared-ui, shared-llm; both report no test files) |
| Types | Pass | 8/8 tasks (API type-check fixed in 7d9005c) |
| Lint | Pass | 5/5 tasks, no ESLint warnings |
| Architecture | Pass | `python3 scripts/check_architecture_limits.py` exits 0 |
| Sentry | — | Not checked (MCP/connection not verified) |
| Recent commits | — | 8ab8a96 journal + anti-patterns; 7d9005c fix API types + braintrust deps; 70562fb CI hardening |

---

## 2. Findings

### 2.1 Type safety and conventions

- **Type-check:** All packages pass; API schema, rate-limiter, and prompts route issues were resolved.
- **No `any`:** Grep for `: any` / `as any` in `*.ts`/`*.tsx` found no matches. Project rule (no `any`, prefer `unknown`) is satisfied.
- **Console.log:** Only reference is in a comment in root `eslint.config.js`. No console.log in app source.
- **File/function length:** Not measured; convention is &lt;400 lines per file, &lt;75 per function.

### 2.2 Tooling and scripts

- **Architecture script:** `scripts/check_architecture_limits.py` runs with `python3`; status skill references `python` — on hosts where `python` is not in PATH, use `python3` in the skill or CI.
- **Validation report:** `docs/PLAYBOOK-VALIDATION-REPORT.md` documents Tier 1/2/3 and stub gates; aligns with playbook and MOAT stack.

### 2.3 Deployment and env

- Root `package.json`: workspaces, Node ≥22, turbo for build/type-check/lint/test.
- API deploy target: Railway. Per CLAUDE.md, verify env vars (e.g. `REDIS_URL`) match Railway and Vercel before deploy.

### 2.4 Documentation and playbook alignment

- **CLAUDE.md:** Single source of truth; verify-before-summarize, test incrementally, no `any`, explicit types.
- **MOAT-STACK-SETUP.md:** Tier 1–3 tools and prompt versioning + A/B pattern documented; checklist present.
- **LEARNING_JOURNAL.md:** Anti-pattern registry and recent entries present; required reading before implementation.

---

## 3. Recommendations (priority order)

1. **Status skill / CI:** Use `python3` for `check_architecture_limits.py` (or ensure `python` is available in CI). **Confidence: high.**
2. **Add tests:** `@playbook/shared-llm` and `@playbook/shared-ui` report "No test files found"; add tests where business logic exists. **Confidence: medium.**
3. **Track validation gates:** Per `PLAYBOOK-VALIDATION-REPORT.md`, several CI gates are stubs (doc freshness, hallucination, PR template, API contract, destructive SQL); plan to replace with real checks when ready. **Confidence: medium.**

---

## 4. Out of scope for this audit

- Security review (no explicit threat model or ownership run).
- UI/UX or frontend-only audit.
- Full deployment verification (env, Railway/Vercel).
- Sentry issue count (MCP not verified).

---

*Generated from git state, `npm test`, `npx turbo run type-check`, `npx turbo run lint`, and `python3 scripts/check_architecture_limits.py`.*
