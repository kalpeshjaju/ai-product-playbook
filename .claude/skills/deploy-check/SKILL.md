---
name: deploy-check
description: Run deployment checklist before deploying to Railway or Vercel. Catches missing deps, env var mismatches, and service health issues.
disable-model-invocation: true
---

## Pre-Deploy Checklist

Run each check and report pass/fail:

### 1. Dependencies
- Run `npm ci --dry-run` in the repo root to verify all deps resolve
- Check `packages/shared-llm/package.json` and `apps/api/package.json` for any missing deps
- For Python services (`services/crawl4ai/`, `services/dspy/`), verify `requirements.txt` lists all imports

### 2. Type Check
- Run `npx turbo run type-check` and report any errors

### 3. Tests
- Run `npx turbo run test` and report pass/fail counts

### 4. Environment Variables
- List all env vars referenced in code: !`grep -rh 'process\.env\.' apps/ packages/ --include='*.ts' | sed 's/.*process\.env\.\([A-Z_]*\).*/\1/' | sort -u`
- Compare against Railway/Vercel — flag any that might be missing
- Check for secrets accidentally hardcoded in source

### 5. Service Health (if running locally)
- `curl -s http://localhost:4000/health` (LiteLLM)
- `curl -s http://localhost:8000/health` (Crawl4AI)
- `curl -s http://localhost:3002/api/health` (API)

### 6. Git State
- Confirm all changes are committed and pushed
- Confirm branch is up to date with remote

Report a summary table at the end:
| Check | Status |
|-------|--------|
| Dependencies | pass/fail |
| Type check | pass/fail |
| Tests | X passed, Y failed |
| Env vars | X matched, Y missing |
| Services | X healthy, Y down |
| Git | clean/dirty |
