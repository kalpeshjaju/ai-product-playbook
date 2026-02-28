#!/usr/bin/env bash
# Verify all LLM call sites include rate limiting.
# Playbook §18 [HARD GATE]: Every LLM-facing API route must call checkTokenBudget().
# Source: Playbook §18 line 3984.
set -euo pipefail

LLM_FILES=$(grep -rl 'llm\.chat\|streamText\|generateText' src/ --include='*.ts' 2>/dev/null || true)

if [ -z "$LLM_FILES" ]; then
  echo "✅ check-rate-limit: no LLM call sites found (pass)"
  exit 0
fi

FAILED=0
for f in $LLM_FILES; do
  if ! grep -q 'checkTokenBudget\|rateLimi' "$f"; then
    echo "❌ $f calls LLM without rate limiting"
    FAILED=1
  fi
done

if [ "$FAILED" -eq 1 ]; then
  exit 1
fi
echo "✅ check-rate-limit: all LLM call sites include rate limiting"
