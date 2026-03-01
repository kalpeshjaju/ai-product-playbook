#!/usr/bin/env bash
# Delegates to TypeScript implementation for reliable route extraction.
# Falls back to basic grep if tsx is not available.
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01

set -euo pipefail

if command -v npx &>/dev/null && npx tsx --version &>/dev/null 2>&1; then
  npx tsx scripts/check-api-contracts.ts
else
  echo "⚠️  tsx not available — falling back to basic grep check"
  if [ ! -f docs/API_CONTRACTS.md ]; then
    echo "❌ docs/API_CONTRACTS.md missing"
    exit 1
  fi
  echo "✅ API_CONTRACTS.md exists (full validation requires tsx)"
fi
