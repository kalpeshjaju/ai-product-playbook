---
name: ship
description: Stage, commit, push, and create PR with all required template sections. Use when the user says "ship it", "create PR", or "push and PR".
---

# /ship — Commit, Push, and Create PR

One-command flow from working code to open PR with all required CI template sections.

## Steps

### 1 [D]: Pre-flight checks

```bash
# Verify not on main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ]; then echo "ERROR: On main. Create a feature branch first."; exit 1; fi

# Check for changes
git status --short
git diff --stat
```

### 2 [D]: Run quality gates

```bash
npx turbo run type-check --force 2>&1 | tail -10
npx turbo run test --force 2>&1 | tail -15
```

If either fails, fix the issues before proceeding. Do NOT skip.

### 3 [A]: Stage and commit

- Stage relevant files (not `.env`, not `node_modules`, not test artifacts)
- Write a concise commit message with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Use HEREDOC format for multi-line messages

### 4 [D]: Push

```bash
git push -u origin $(git branch --show-current)
```

### 5 [A]: Create PR with all required sections

Create PR using `gh pr create` with ALL 6 required sections:

```
## Summary
[1-3 bullet points]

## Risk Level
LOW | MEDIUM | HIGH — [1 sentence why]

## Maker LLM
Claude Opus 4.6 ([branch-name])

## Task Contract
- **Goal**: [1 sentence]
- **Non-Goals**: [what this does NOT do]
- **Modules Touched**: [files/directories]
- **Acceptance Criteria**: [testable conditions]
- **Rollback Plan**: [how to undo]

## Test plan
- [ ] [concrete verification steps]

## Proof
[real output: test results, curl output, or screenshots]
Confidence: **VERIFIED (0.95)** | **HIGH (0.85)** | **MEDIUM (0.70)**
```

### 6 [D]: Report

Output the PR URL and a summary of what was shipped.

## Rules

- NEVER skip quality gates (type-check + test)
- NEVER commit to main directly
- ALWAYS include all 6 PR template sections (Summary, Risk Level, Maker LLM, Task Contract, Test plan, Proof)
- ALWAYS use `Co-Authored-By` in commit message
