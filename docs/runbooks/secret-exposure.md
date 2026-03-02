# Runbook: Secret Exposure

> When an API key, password, or token is exposed in code, logs, or public channels.

## Symptoms

- GitGuardian alert (email or CI failure)
- Secret found in git history, CI logs, or client-side bundle
- Unauthorized API usage detected (unexpected cost spike)

## Immediate (within 15 minutes)

1. **Revoke** the exposed secret immediately:
   - API keys: regenerate in provider dashboard (Anthropic, OpenAI, etc.)
   - Database passwords: rotate in Railway dashboard
   - Clerk keys: regenerate in Clerk dashboard
2. **Rotate** all secrets on the same service (if one leaked, assume others might be compromised)
3. **Check blast radius**: which services used this secret?

## Diagnose

1. How was the secret exposed?
   - In a git commit? → Check with `git log --all -S "SECRET_PREFIX" --oneline`
   - In CI logs? → Review workflow run logs
   - In client bundle? → Check for `NEXT_PUBLIC_` prefix misuse
2. Check GitGuardian dashboard for scope and timeline
3. Review provider dashboards for unauthorized usage since exposure time

## Remediate

**If in git history:**
1. Remove from history: `git filter-repo --invert-paths --path <file>` (or BFG Repo Cleaner)
2. Force-push affected branches (coordinate with team)
3. Invalidate GitHub caches: `gh api repos/{owner}/{repo}/git/refs -X DELETE` if needed

**If in CI logs:**
1. Delete the affected workflow run logs
2. Fix the workflow to mask the secret (use `::add-mask::` in GitHub Actions)

**Update secrets everywhere:**
1. Railway: `railway variables set KEY=new_value`
2. Vercel: update via dashboard or CLI
3. GitHub Secrets: update in repo settings
4. Wait for redeployment (Railway: 1-3 min, Vercel: 2-5 min)

## Recovery Verification

1. Old secret no longer works: test with `curl` using old value → expect 401
2. New secret works: `GET /api/health` returns 200
3. GitGuardian re-scan shows clean
4. No unauthorized usage in provider billing dashboards

## Post-Mortem

- Log in `docs/INCIDENTS.md`
- Verify `.env.example` documents the rotated var
- Check that `hallucination_check.sh` catches the pattern
- Review: should this secret have been in `.gitignore`?
