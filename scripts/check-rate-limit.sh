#!/usr/bin/env bash
# Verify all LLM call sites include rate limiting.
# Playbook §18 [HARD GATE]: Every LLM-facing API route must call checkTokenBudget().
# Source: Playbook §18 line 3984.
set -euo pipefail

API_SRC="apps/api/src"
if [ ! -d "$API_SRC" ]; then
  echo "✅ check-rate-limit: apps/api/src not found (nothing to check)"
  exit 0
fi

# Scope to API source to avoid false positives in shared libraries.
LLM_PATTERN='createLLMClient\(|\.chat\.completions\.create\(|\.embeddings\.create\(|streamText\(|generateText\('
LLM_FILES="$(grep -RIl --include='*.ts' --include='*.tsx' -E "$LLM_PATTERN" "$API_SRC" 2>/dev/null || true)"

if [ -z "$LLM_FILES" ]; then
  echo "✅ check-rate-limit: no API LLM call sites found (pass)"
  exit 0
fi

FAILED=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! grep -q 'checkTokenBudget' "$f"; then
    echo "❌ $f calls LLM without rate limiting"
    FAILED=1
  fi
done <<< "$LLM_FILES"

if [ "$FAILED" -eq 1 ]; then
  exit 1
fi
echo "✅ check-rate-limit: all LLM call sites include rate limiting"
