#!/usr/bin/env bash
# Verify all LLM call sites include rate limiting.
# Playbook §18 [HARD GATE]: Every LLM-facing API route must call checkTokenBudget().
# Source: Playbook §18 line 3984.
set -euo pipefail

LLM_FILES=""
for dir in apps/ packages/; do
  if [ -d "$dir" ]; then
    FOUND=$(grep -rl 'llm\.chat\|streamText\|generateText\|embeddings\.create' "$dir" --include='*.ts' --include='*.tsx' --exclude-dir='dist' --exclude-dir='node_modules' 2>/dev/null || true)
    if [ -n "$FOUND" ]; then
      LLM_FILES+="$FOUND"$'\n'
    fi
  fi
done

# Deduplicate and trim empty lines
LLM_FILES=$(echo "$LLM_FILES" | sed '/^$/d' | sort -u)

if [ -z "$LLM_FILES" ]; then
  echo "✅ check-rate-limit: no LLM call sites found (pass)"
  exit 0
fi

FAILED=0
while IFS= read -r f; do
  if ! grep -q 'checkTokenBudget\|rateLimi' "$f"; then
    echo "❌ $f calls LLM without rate limiting"
    FAILED=1
  fi
done <<< "$LLM_FILES"

if [ "$FAILED" -eq 1 ]; then
  exit 1
fi
echo "✅ check-rate-limit: all LLM call sites include rate limiting"
