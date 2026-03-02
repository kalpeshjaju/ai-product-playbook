#!/usr/bin/env bash
##
# FILE PURPOSE: CI hard gate — verify LLM call sites include context injection
#
# WHY: Strategy pillar (§20–§22) requires per-user context on LLM calls
#      so outputs can be personalized and traced.
#
# HOW: Scans API source for LLM call patterns and enforces:
#      - identity-aware headers (withLangfuseHeaders/langfuseHeaders)
#      - route-level user context extraction (createUserContext)
#
# AUTHOR: Codex (GPT-5)
# LAST UPDATED: 2026-03-02
##

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_SRC="$ROOT_DIR/apps/api/src"

if [ ! -d "$API_SRC" ]; then
  echo "PASS: apps/api/src not found (nothing to check)"
  exit 0
fi

# LLM invocation patterns used in this repo today.
LLM_PATTERN='createLLMClient\(|streamText\(|generateText\(|\.chat\.completions\.create\(|\.responses\.create\('

LLM_FILES_RAW="$(grep -RIl --include='*.ts' -E "$LLM_PATTERN" "$API_SRC" 2>/dev/null || true)"

if [ -z "$LLM_FILES_RAW" ]; then
  echo "PASS: no LLM call sites found"
  exit 0
fi

FAILED=0
echo "=== Context Injection Check (§20–§22) ==="
while IFS= read -r file; do
  [ -z "$file" ] && continue
  FILE_FAILED=0

  if ! grep -Eq 'withLangfuseHeaders|langfuseHeaders' "$file"; then
    echo "FAIL: $file missing langfuse headers context"
    FILE_FAILED=1
    FAILED=1
  fi

  if [[ "$file" == *"/routes/"* ]] && ! grep -Eq 'createUserContext\(|authResult\.userContext' "$file"; then
    echo "FAIL: $file is a route-level LLM call site without user context resolution"
    FILE_FAILED=1
    FAILED=1
  fi

  if [ "$FILE_FAILED" -eq 0 ]; then
    echo "OK:   $file"
  fi
done <<< "$LLM_FILES_RAW"

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "FAILED — every LLM call site must include user context + trace headers"
  exit 1
fi

echo "PASS — all LLM call sites use context injection"
