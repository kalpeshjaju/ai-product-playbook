---
name: ci-fix
description: Autonomous CI triage — fetch failures, diagnose, fix, verify green. Use when user says "/ci-fix" or asks to fix CI.
disable-model-invocation: true
---

## CI Fix Workflow

Fix all failing GitHub Actions workflows autonomously. Do NOT stop until local checks pass.

### 1. Fetch failures

```bash
gh run list --limit 10 --json status,conclusion,name,databaseId,headBranch --jq '.[] | select(.conclusion == "failure")'
```

For each failed run, get the logs:
```bash
gh run view <id> --log-failed 2>&1 | tail -100
```

### 2. Classify each error

- **Type error**: tsc compilation failure
- **Lint**: ESLint violations
- **Test failure**: Vitest/Playwright assertion or timeout
- **Build config**: Turbo, Next.js, or Docker build issues
- **Missing dependency**: Module not found, peer dep mismatch
- **Env var**: Missing or undefined environment variable

### 3. Fix each error

Read the relevant source files, understand the context, make the minimal fix.
For dependency issues, update `package.json` and run `npm install`.

### 4. Verify locally

```bash
npm run check  # turbo: type-check + lint + test
```

If verification fails, fix and re-verify. Loop until green.

### 5. Commit and push

```bash
git add <specific-files>
git commit -m "fix(ci): resolve [N] pipeline failures — [brief description]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push
```

### Rules

- Fix root causes, not symptoms (don't add `@ts-ignore` or `--no-verify`)
- Never force-push or amend existing commits
- If a failure is environment-specific (missing secret in CI), document it and skip
- Report a summary of fixes at the end
