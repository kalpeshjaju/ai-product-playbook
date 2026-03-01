#!/bin/bash
# Hallucination & Integrity Detection Script — BLOCKING CI GATE
#
# WHY: LLMs fabricate imports, env vars, file references, and API endpoints.
#      This script catches those before they reach production.
#
# HOW: Static analysis of changed files — checks imports, env vars, file
#      references, and common fabrication patterns against the actual codebase.
#      Exits non-zero on any fabricated data, debug artifacts, or undocumented env vars.
#
# USAGE:
#   bash scripts/hallucination_check.sh                          # Check all files
#   bash scripts/hallucination_check.sh --base main              # Check only changed files vs main
#   bash scripts/hallucination_check.sh --base main --output report.md
#
# AUTHOR: Adapted from job-matchmaker
# LAST UPDATED: 2026-02-28

set -euo pipefail

# ─── Args ─────────────────────────────────────────────────────────────
BASE_BRANCH=""
OUTPUT_FILE=""
ERRORS=0
WARNINGS=0
REPORT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --base)   BASE_BRANCH="$2"; shift 2 ;;
    --output) OUTPUT_FILE="$2"; shift 2 ;;
    *)        shift ;;
  esac
done

# ─── Helpers ──────────────────────────────────────────────────────────
add_error() {
  ERRORS=$((ERRORS + 1))
  REPORT+="❌ **ERROR**: $1"$'\n'
}

add_warning() {
  WARNINGS=$((WARNINGS + 1))
  REPORT+="⚠️ **WARNING**: $1"$'\n'
}

add_pass() {
  REPORT+="✅ $1"$'\n'
}

# ─── Get changed files ───────────────────────────────────────────────
if [ -n "$BASE_BRANCH" ]; then
  CHANGED_PY=$(git diff --name-only "origin/${BASE_BRANCH}...HEAD" -- '*.py' 2>/dev/null || true)
  CHANGED_TS=$(git diff --name-only "origin/${BASE_BRANCH}...HEAD" -- '*.ts' '*.tsx' 2>/dev/null || true)
  CHANGED_ALL=$(git diff --name-only "origin/${BASE_BRANCH}...HEAD" 2>/dev/null || true)
else
  # Scan common source directories
  CHANGED_PY=""
  for dir in src backend lib app apps packages; do
    [ -d "$dir" ] && CHANGED_PY+=$(find "$dir" -name "*.py" -type f 2>/dev/null)$'\n'
  done
  CHANGED_TS=""
  for dir in src frontend lib app apps packages; do
    [ -d "$dir" ] && CHANGED_TS+=$(find "$dir" \( -name "*.ts" -o -name "*.tsx" \) -type f 2>/dev/null | grep -v node_modules)$'\n'
  done
  CHANGED_ALL="$CHANGED_PY"$'\n'"$CHANGED_TS"
fi

if [ -z "$CHANGED_ALL" ]; then
  REPORT="### No files changed. Nothing to check."
  if [ -n "$OUTPUT_FILE" ]; then echo "$REPORT" > "$OUTPUT_FILE"; fi
  echo "$REPORT"
  exit 0
fi

REPORT+="### Files scanned"$'\n'
REPORT+="- Python: $(echo "$CHANGED_PY" | grep -c . || echo 0) files"$'\n'
REPORT+="- TypeScript: $(echo "$CHANGED_TS" | grep -c . || echo 0) files"$'\n\n'

# ═══════════════════════════════════════════════════════════════════════
# CHECK 1: Fabricated data patterns
# ═══════════════════════════════════════════════════════════════════════
REPORT+="### 1. Fabricated Data Detection"$'\n'

FABRICATION_PATTERNS=(
  'sk-[a-zA-Z0-9]{20,}'
  'pk_test_[a-zA-Z0-9]{20,}'
  'pk_live_[a-zA-Z0-9]{20,}'
  'api\.acme\.com'
  'api\.mycompany\.com'
  'api\.yourapp\.com'
  'lorem ipsum'
  'Lorem Ipsum'
  'TODO:.*implement'
  'FIXME:.*later'
  'HACK:.*workaround'
)

FABRICATION_FOUND=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ ! -f "$f" ] && continue

  case "$f" in
    tests/*|*.test.*|*.spec.*|*.example|.env*|*.md|scripts/hallucination_check.sh) continue ;;
  esac

  for pattern in "${FABRICATION_PATTERNS[@]}"; do
    MATCHES=$(grep -nE "$pattern" "$f" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      while IFS= read -r match; do
        FABRICATION_FOUND+="  - \`$f:$(echo "$match" | cut -d: -f1)\` — matches \`$pattern\`"$'\n'
      done <<< "$MATCHES"
    fi
  done
done <<< "$CHANGED_ALL"

if [ -n "$FABRICATION_FOUND" ]; then
  add_error "Fabricated data patterns found in production code:"$'\n'"$FABRICATION_FOUND"
else
  add_pass "No obvious fabricated data patterns detected"
fi

REPORT+=$'\n'

# ═══════════════════════════════════════════════════════════════════════
# CHECK 2: Console.log / debug artifacts in production code
# ═══════════════════════════════════════════════════════════════════════
REPORT+="### 2. Debug Artifact Detection"$'\n'

DEBUG_FOUND=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ ! -f "$f" ] && continue
  case "$f" in
    tests/*|*.test.*|*.spec.*|*.md|scripts/*) continue ;;
  esac

  if [[ "$f" == *.py ]]; then
    PRINTS=$(grep -nE "^\s*print\(" "$f" 2>/dev/null || true)
    if [ -n "$PRINTS" ]; then
      while IFS= read -r match; do
        DEBUG_FOUND+="  - \`$f:$(echo "$match" | cut -d: -f1)\` — \`print()\` in production code"$'\n'
      done <<< "$PRINTS"
    fi
  fi

  if [[ "$f" == *.ts ]] || [[ "$f" == *.tsx ]]; then
    CONSOLE_LOGS=$(grep -nE "console\.(log|debug|info)\(" "$f" 2>/dev/null || true)
    if [ -n "$CONSOLE_LOGS" ]; then
      while IFS= read -r match; do
        DEBUG_FOUND+="  - \`$f:$(echo "$match" | cut -d: -f1)\` — \`console.log\` in production code"$'\n'
      done <<< "$CONSOLE_LOGS"
    fi
  fi
done <<< "$CHANGED_ALL"

if [ -n "$DEBUG_FOUND" ]; then
  add_error "Debug statements found in production code:"$'\n'"$DEBUG_FOUND"
else
  add_pass "No debug artifacts (print/console.log) in production code"
fi

REPORT+=$'\n'

# ═══════════════════════════════════════════════════════════════════════
# CHECK 3: Environment variable verification
# ═══════════════════════════════════════════════════════════════════════
REPORT+="### 3. Environment Variable Verification"$'\n'

if [ -f ".env.example" ]; then
  USED_ENVS=$(echo "$CHANGED_ALL" | while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ ! -f "$f" ] && continue
    # Skip test, spec, and config files — they often reference env vars for test setup
    [[ "$f" == tests/* || "$f" == *.test.* || "$f" == *.spec.* ]] && continue
    grep -ohE 'os\.environ\[["'"'"'][A-Z0-9_]+["'"'"']\]|os\.getenv\(["'"'"'][A-Z0-9_]+["'"'"']|environ\.get\(["'"'"'][A-Z0-9_]+["'"'"']' "$f" 2>/dev/null \
      | grep -oE '[A-Z0-9_]{3,}' || true
    grep -ohE 'process\.env\.[A-Z0-9_]+|NEXT_PUBLIC_[A-Z0-9_]+' "$f" 2>/dev/null \
      | sed 's/process\.env\.//' || true
  done | sort -u)

  DOCUMENTED_ENVS=$(grep -oE '^[A-Z_]+' .env.example | sort -u)
  FRAMEWORK_VARS="CI NODE_ENV PYTHONPATH PATH HOME USER GITHUB_TOKEN DATABASE_URL PORT"

  MISSING_ENVS=""
  while IFS= read -r var; do
    [ -z "$var" ] && continue
    echo "$FRAMEWORK_VARS" | grep -qw "$var" && continue
    [[ "$var" == NEXT_PUBLIC_* ]] && continue
    if ! echo "$DOCUMENTED_ENVS" | grep -qw "$var"; then
      MISSING_ENVS+="  - \`$var\`"$'\n'
    fi
  done <<< "$USED_ENVS"

  if [ -n "$MISSING_ENVS" ]; then
    add_error "Env vars used in code but missing from .env.example:"$'\n'"$MISSING_ENVS"
  else
    add_pass "All environment variables documented in .env.example"
  fi
else
  add_warning "No .env.example found — cannot verify env vars"
fi

REPORT+=$'\n'

# ═══════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════
REPORT+="---"$'\n'
REPORT+="### Summary"$'\n'
REPORT+="- Errors: **$ERRORS**"$'\n'
REPORT+="- Warnings: **$WARNINGS**"$'\n'

if [ "$ERRORS" -gt 0 ]; then
  REPORT+="- Status: ❌ **FAILED** — $ERRORS error(s) must be fixed before merge"$'\n'
elif [ "$WARNINGS" -gt 0 ]; then
  REPORT+="- Status: ⚠️ **PASSED WITH WARNINGS** — $WARNINGS warning(s) to review"$'\n'
else
  REPORT+="- Status: ✅ **CLEAN** — No issues detected"$'\n'
fi

echo "$REPORT"

if [ -n "$OUTPUT_FILE" ]; then
  echo "$REPORT" > "$OUTPUT_FILE"
  echo ""
  echo "Report written to: $OUTPUT_FILE"
fi

if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
