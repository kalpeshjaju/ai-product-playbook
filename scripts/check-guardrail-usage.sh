#!/usr/bin/env bash
##
# FILE PURPOSE: CI gate — verify that all API routes returning LLM/external text
#               call scanOutput() before responding.
#
# WHY: Playbook §21 mandates output guardrails on all user-facing LLM text.
#      This script ensures new routes cannot skip scanning.
#
# HOW: Identifies route files that call LLM/external providers, then checks
#      each one for a scanOutput import. Fails if any route is missing it.
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01
##

set -euo pipefail

API_ROUTES="apps/api/src/routes"
FAIL=0

# Routes that call LLM providers or return external/model-generated text.
# Pattern: createLLMClient, transcribeAudio, executeAction, memory.search, memory.getAll
EXTERNAL_TEXT_PATTERN='transcribeAudio\(|executeAction\(|memory\.search\(|memory\.getAll\(|createLLMClient\(.*\.chat\.'

echo "=== Guardrail Usage Check (§21) ==="
echo ""

# Find route files that match the external-text pattern
FILES_WITH_EXTERNAL=$(grep -RIl --include='*.ts' -E "$EXTERNAL_TEXT_PATTERN" "$API_ROUTES" 2>/dev/null || true)

if [ -z "$FILES_WITH_EXTERNAL" ]; then
  echo "No route files with external text providers found."
  echo "PASS"
  exit 0
fi

for f in $FILES_WITH_EXTERNAL; do
  # Check if this file imports scanOutput
  if ! grep -q 'scanOutput' "$f"; then
    echo "FAIL: $f calls an external provider but does not import/use scanOutput"
    FAIL=1
  else
    echo "OK:   $f"
  fi
done

echo ""
if [ "$FAIL" -eq 1 ]; then
  echo "FAILED — routes above must import and call scanOutput() from @playbook/shared-llm"
  echo "See: packages/shared-llm/src/guardrails/scanner.ts"
  exit 1
fi

echo "PASS — all external-text routes use scanOutput()"
