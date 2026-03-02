#!/usr/bin/env bash
##
# FILE PURPOSE: CI hard gate — verify AI quality logging infrastructure
#
# WHY: Strategy pillar (§21/§22) depends on ai_generations + outcomes to
#      power feedback loops and moat health metrics.
#
# HOW: Verifies non-negotiable logging contracts remain wired:
#      - ai_generations schema columns exist
#      - generation route builds + inserts structured records
#      - feedback route updates ai_generations and writes outcomes
#      - server routes /api/generations and /api/feedback
#
# AUTHOR: Codex (GPT-5)
# LAST UPDATED: 2026-03-02
##

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

echo "=== AI Logging Check (§21/§22) ==="

require_pattern() {
  local file="$1"
  local pattern="$2"
  local description="$3"

  if [ ! -f "$file" ]; then
    echo "FAIL: missing file: $file ($description)"
    FAILED=1
    return
  fi

  if grep -Eq "$pattern" "$file"; then
    echo "OK:   $description"
  else
    echo "FAIL: $description ($file)"
    FAILED=1
  fi
}

SCHEMA_FILE="$ROOT_DIR/apps/api/src/db/schema.ts"
GEN_FILE="$ROOT_DIR/apps/api/src/routes/generations.ts"
FEEDBACK_FILE="$ROOT_DIR/apps/api/src/routes/feedback.ts"
SERVER_FILE="$ROOT_DIR/apps/api/src/server.ts"

# Plane 3 schema essentials
require_pattern "$SCHEMA_FILE" "export const aiGenerations = pgTable\(" 'ai_generations table exists'
require_pattern "$SCHEMA_FILE" "userId: text\('user_id'\)\.notNull\(\)" 'ai_generations stores user_id'
require_pattern "$SCHEMA_FILE" "promptVersion: text\('prompt_version'\)\.notNull\(\)" 'ai_generations stores prompt_version'
require_pattern "$SCHEMA_FILE" "qualityScore: numeric\('quality_score'" 'ai_generations stores quality score'
require_pattern "$SCHEMA_FILE" "guardrailTriggered: text\('guardrail_triggered'\)\.array\(\)" 'ai_generations stores guardrail triggers'

# Route wiring + logging behavior
require_pattern "$GEN_FILE" 'createGenerationLog' 'generation route builds structured AI log records'
require_pattern "$GEN_FILE" '\.insert\(aiGenerations\)' 'generation route persists ai_generations records'

require_pattern "$FEEDBACK_FILE" '\.update\(aiGenerations\)' 'feedback route updates quality feedback on ai_generations'
require_pattern "$FEEDBACK_FILE" '\.insert\(outcomes\)' 'feedback route persists outcomes'

require_pattern "$SERVER_FILE" "url\.startsWith\('/api/generations'\)" 'server exposes /api/generations route'
require_pattern "$SERVER_FILE" "url\.startsWith\('/api/feedback'\)" 'server exposes /api/feedback route'

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "FAILED — AI logging contract is incomplete"
  exit 1
fi

echo "PASS — AI logging contract intact"
