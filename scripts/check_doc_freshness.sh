#!/bin/bash
# Doc Freshness Enforcement Script
#
# WHY: When code changes, docs must update too. Stale docs cause LLMs to
#      build against outdated context — worse than no docs at all.
#
# HOW: Checks if source files changed without corresponding doc updates.
#      Maps source directories to their required doc files.
#
# USAGE:
#   bash scripts/check_doc_freshness.sh              # Check against main
#   bash scripts/check_doc_freshness.sh --base main   # Explicit base branch
#
# AUTHOR: Created for ai-product-playbook (from playbook Section 5)
# LAST UPDATED: 2026-02-28

set -euo pipefail

BASE_BRANCH="${1:-main}"

# Strip --base flag if passed
if [ "$BASE_BRANCH" = "--base" ]; then
  BASE_BRANCH="${2:-main}"
fi

WARNINGS=0

# Get changed files
CHANGED=$(git diff --name-only "origin/${BASE_BRANCH}...HEAD" 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || true)

if [ -z "$CHANGED" ]; then
  echo "✅ No files changed. Docs are fresh."
  exit 0
fi

echo "=== Doc Freshness Check ==="
echo ""

# Check 1: If source code changed, did docs/ also change?
CODE_CHANGED=$(echo "$CHANGED" | grep -E '\.(py|ts|tsx|js|jsx)$' | grep -v 'test' | grep -v 'spec' || true)
DOCS_CHANGED=$(echo "$CHANGED" | grep '^docs/' || true)

if [ -n "$CODE_CHANGED" ] && [ -z "$DOCS_CHANGED" ]; then
  echo "⚠️  Source code changed but no docs updated:"
  echo "$CODE_CHANGED" | head -10 | sed 's/^/   /'
  echo ""
  echo "   Consider updating: docs/ARCHITECTURE.md, docs/DECISIONS.md, or docs/LEARNING_JOURNAL.md"
  WARNINGS=$((WARNINGS + 1))
else
  echo "✅ Docs updated alongside code changes"
fi

# Check 2: If CONSTRAINTS.md or DECISIONS.md were modified, flag for review
CRITICAL_DOCS_CHANGED=$(echo "$CHANGED" | grep -E 'docs/(CONSTRAINTS|DECISIONS|PRODUCT)\.md' || true)
if [ -n "$CRITICAL_DOCS_CHANGED" ]; then
  echo ""
  echo "📋 Critical docs changed (require owner review):"
  echo "$CRITICAL_DOCS_CHANGED" | sed 's/^/   /'
fi

# Check 3: Required docs exist
echo ""
REQUIRED_DOCS=("docs/PRODUCT.md" "docs/CONSTRAINTS.md" "docs/DECISIONS.md" "docs/LEARNING_JOURNAL.md" "CLAUDE.md")
for doc in "${REQUIRED_DOCS[@]}"; do
  if [ ! -f "$doc" ]; then
    echo "❌ Required doc missing: $doc"
    WARNINGS=$((WARNINGS + 1))
  fi
done

if [ "$WARNINGS" -eq 0 ]; then
  echo "✅ All doc freshness checks passed"
else
  echo ""
  echo "⚠️  $WARNINGS warning(s) — review above and update docs if needed"
fi

# Hard gate — block when warnings found
if [ "$WARNINGS" -gt 0 ]; then
  exit 1
fi
exit 0
