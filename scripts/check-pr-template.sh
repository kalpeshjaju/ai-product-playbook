#!/usr/bin/env bash
# Check PR template: verify PR body contains required sections.
#
# WHY: Enforces consistent PR descriptions so reviewers (human and LLM) have
#      sufficient context. Required by LLM Coding Framework (6 pillars).
# HOW: Reads PR body from $GITHUB_EVENT_PATH (GitHub Actions event JSON),
#      checks for required section headings from the framework PR template.
#
# USAGE: bash scripts/check-pr-template.sh
# EXIT: 0 = pass (all sections present or not a PR), 1 = missing sections
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01

set -euo pipefail

# Only runs on PRs — skip on push events or local runs
if [ -z "${GITHUB_EVENT_PATH:-}" ]; then
  echo "✅ check-pr-template: not a GitHub Actions run — skipping"
  exit 0
fi

if [ ! -f "$GITHUB_EVENT_PATH" ]; then
  echo "✅ check-pr-template: event file not found — skipping"
  exit 0
fi

# Extract PR body from event JSON
# GitHub Actions provides pull_request.body in the event payload
PR_BODY=$(python3 -c "
import json, sys
try:
    with open('$GITHUB_EVENT_PATH') as f:
        event = json.load(f)
    body = event.get('pull_request', {}).get('body', '') or ''
    print(body)
except Exception:
    print('')
" 2>/dev/null || true)

# If no PR body found, this might not be a PR event
if [ -z "$PR_BODY" ]; then
  # Check if this is actually a PR event
  IS_PR=$(python3 -c "
import json
try:
    with open('$GITHUB_EVENT_PATH') as f:
        event = json.load(f)
    print('yes' if 'pull_request' in event else 'no')
except Exception:
    print('no')
" 2>/dev/null || echo "no")

  if [ "$IS_PR" = "no" ]; then
    echo "✅ check-pr-template: not a pull request event — skipping"
    exit 0
  fi

  echo "❌ check-pr-template: PR body is empty"
  echo "   Required sections: ## Summary, ## Risk Level, ## Test Plan, ## Proof, ## Maker LLM, ## Task Contract"
  exit 1
fi

MISSING=0

# Check for required sections (case-insensitive heading match)
for section in "Summary" "Risk Level" "Test Plan" "Proof" "Maker LLM" "Task Contract"; do
  if ! echo "$PR_BODY" | grep -qi "^##[[:space:]]*${section}"; then
    echo "  Missing required section: ## $section"
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -gt 0 ]; then
  echo ""
  echo "❌ check-pr-template: $MISSING required section(s) missing from PR description"
  echo "   Every PR must include: ## Summary, ## Risk Level, ## Test Plan, ## Proof, ## Maker LLM, ## Task Contract"
  exit 1
fi

echo "✅ check-pr-template: all required sections present"
exit 0
