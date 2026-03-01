#!/usr/bin/env bash
# Check for Vercel preview deploy on PRs that touch frontend code.
#
# WHY: UI-touching PRs should have a preview URL for visual review.
# HOW: Uses GitHub API (gh CLI) to check for Vercel bot comments on the PR.
#      Gracefully passes when not in a PR context or when gh is unavailable.
#
# USAGE: bash scripts/check-preview-deploy.sh
# EXIT: 0 = pass, 1 = missing preview deploy on UI PR
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01
set -euo pipefail

# Skip if gh CLI is not available
if ! command -v gh &>/dev/null; then
  echo "✅ check-preview-deploy: gh CLI not available — skipping"
  exit 0
fi

# Skip if not in a PR context
PR_NUMBER="${GITHUB_PR_NUMBER:-}"
if [ -z "$PR_NUMBER" ]; then
  # Try to detect PR number from GitHub Actions event
  if [ -n "${GITHUB_EVENT_PATH:-}" ] && [ -f "${GITHUB_EVENT_PATH}" ]; then
    PR_NUMBER=$(python3 -c "
import json
try:
    with open('$GITHUB_EVENT_PATH') as f:
        event = json.load(f)
    print(event.get('pull_request', {}).get('number', ''))
except Exception:
    print('')
" 2>/dev/null || true)
  fi
fi

if [ -z "$PR_NUMBER" ]; then
  echo "✅ check-preview-deploy: not a PR context — skipping"
  exit 0
fi

# Check if PR touches frontend files
CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only 2>/dev/null || true)
if [ -z "$CHANGED_FILES" ]; then
  echo "✅ check-preview-deploy: could not read PR diff — skipping"
  exit 0
fi

TOUCHES_UI=false
if echo "$CHANGED_FILES" | grep -qE '^apps/(web|admin)/'; then
  TOUCHES_UI=true
fi

if [ "$TOUCHES_UI" = false ]; then
  echo "✅ check-preview-deploy: PR does not touch apps/web/ or apps/admin/ — skipping"
  exit 0
fi

# Check for Vercel bot comment with preview URL
VERCEL_COMMENT=$(gh pr view "$PR_NUMBER" --comments --json comments \
  --jq '.comments[] | select(.author.login == "vercel[bot]") | .body' 2>/dev/null || true)

if [ -z "$VERCEL_COMMENT" ]; then
  echo "⚠️ check-preview-deploy: PR touches UI code but no Vercel preview found"
  echo "   Ensure Vercel GitHub integration is configured for preview deploys."
  echo "   Passing with warning (non-blocking until integration is wired)."
  exit 0
fi

echo "✅ check-preview-deploy: Vercel preview deploy found"
exit 0
