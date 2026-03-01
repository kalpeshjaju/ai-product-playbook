#!/usr/bin/env bash
# Impact Graph — Maps changed files to must-run tests, high-risk areas, and review checklist
#
# WHY: When you change files in a monorepo, not all tests need to run.
#      This script identifies the MINIMUM viable test set + highlights risky changes.
#
# HOW: Analyzes changed files, categorizes by area (apps, packages, scripts, etc),
#      maps to must-run tests, flags high-risk patterns, and generates a review checklist.
#
# USAGE:
#   bash scripts/impact-graph.sh                                # Check staged+unstaged changes
#   bash scripts/impact-graph.sh --base main                    # Check only changes vs main
#   bash scripts/impact-graph.sh --files "file1 file2 file3"    # Check explicit file list
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────
BASE_BRANCH=""
EXPLICIT_FILES=""
CHANGED_FILES=""
TEMP_TESTS="/tmp/impact_tests_$$"
TEMP_RISKS="/tmp/impact_risks_$$"
TEMP_CHECKLIST="/tmp/impact_checklist_$$"

# Initialize temp files
touch "$TEMP_TESTS" "$TEMP_RISKS" "$TEMP_CHECKLIST"

# ─── Cleanup on exit ───────────────────────────────────────────────────────
trap 'rm -f "$TEMP_TESTS" "$TEMP_RISKS" "$TEMP_CHECKLIST"' EXIT

# ─── Parse args ───────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case $1 in
    --base)  BASE_BRANCH="$2"; shift 2 ;;
    --files) EXPLICIT_FILES="$2"; shift 2 ;;
    *)       shift ;;
  esac
done

# ─── Get changed files ───────────────────────────────────────────────────
if [ -n "$EXPLICIT_FILES" ]; then
  # Convert space-separated files to newline-separated
  CHANGED_FILES=$(echo "$EXPLICIT_FILES" | tr ' ' '\n')
elif [ -n "$BASE_BRANCH" ]; then
  CHANGED_FILES=$(git diff --name-only "origin/${BASE_BRANCH}...HEAD" 2>/dev/null || true)
else
  CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null || true)
  if [ -z "$CHANGED_FILES" ]; then
    CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
  fi
fi

if [ -z "$CHANGED_FILES" ]; then
  echo ""
  echo "═══════════════════════════════════════════════════════════════════════"
  echo "IMPACT GRAPH — NO CHANGES DETECTED"
  echo "═══════════════════════════════════════════════════════════════════════"
  echo ""
  echo "No changed files found."
  echo ""
  exit 0
fi

# ─── Helper functions ──────────────────────────────────────────────────────
add_test() {
  local test="$1"
  if ! grep -q "^${test}$" "$TEMP_TESTS" 2>/dev/null; then
    echo "$test" >> "$TEMP_TESTS"
  fi
}

add_risk() {
  local risk="$1"
  if ! grep -q "^${risk}$" "$TEMP_RISKS" 2>/dev/null; then
    echo "$risk" >> "$TEMP_RISKS"
  fi
}

add_checklist() {
  local item="$1"
  if ! grep -q "^${item}$" "$TEMP_CHECKLIST" 2>/dev/null; then
    echo "$item" >> "$TEMP_CHECKLIST"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# ANALYSIS: Categorize files and determine tests/risks/checklist
# ═══════════════════════════════════════════════════════════════════════════

while IFS= read -r file || [ -n "$file" ]; do
  [ -z "$file" ] && continue

  # packages/shared-llm
  if echo "$file" | grep -q "^packages/shared-llm/"; then
    add_test "npm run test"
    add_risk "SHARED"
    add_checklist "Verify LLM error handling and fallback paths"
    add_checklist "Check cost tracking accuracy"
  fi

  # packages/shared-types
  if echo "$file" | grep -q "^packages/shared-types/"; then
    add_test "npm run test"
    add_test "npm run test:e2e:fullstack"
    add_risk "SHARED"
    add_checklist "Verify all consuming apps still type-check"
    add_checklist "Test backward compatibility if removing fields"
  fi

  # packages/shared-ui
  if echo "$file" | grep -q "^packages/shared-ui/"; then
    add_test "npm run test:e2e:fullstack"
    add_risk "SHARED"
    add_checklist "Test rendering on both web and admin"
    add_checklist "Check for visual regressions in Storybook"
  fi

  # API routes
  if echo "$file" | grep -q "^apps/api/src/routes/"; then
    add_test "npm run test:contract"
    add_risk "API"
    add_checklist "Verify request/response schemas match docs"
    add_checklist "Test error responses (4xx, 5xx)"
  fi

  # API drizzle migrations
  if echo "$file" | grep -q "^apps/api/drizzle/"; then
    add_test "npm run test"
    add_test "npm run test:contract"
    add_risk "DATA"
    add_checklist "Review migration reversibility"
    add_checklist "Test migration on fresh database"
  fi

  # Web/Admin routes
  if echo "$file" | grep -q "^apps/web/src/app/" || echo "$file" | grep -q "^apps/admin/src/app/"; then
    add_test "npm run test:e2e:fullstack"
    add_checklist "Navigate to new routes in E2E"
    add_checklist "Test with missing/invalid API responses"
  fi

  # Web/Admin layouts
  if echo "$file" | grep -q "^apps/web/src/layout.tsx" || echo "$file" | grep -q "^apps/admin/src/layout.tsx"; then
    add_test "npm run test:e2e:fullstack"
    add_checklist "Verify nav links are correct"
    add_checklist "Test auth gating for restricted routes"
  fi

  # API auth/middleware/security
  if echo "$file" | grep -q "^apps/api/src/middleware/" || echo "$file" | grep -q "^apps/api/src/auth/"; then
    add_test "npm run test:contract"
    add_risk "AUTH"
    add_checklist "Verify JWT validation still works"
    add_checklist "Test with expired/invalid tokens"
  fi

  # Drizzle anywhere
  if echo "$file" | grep -q "drizzle"; then
    add_test "npm run test"
    add_test "npm run test:contract"
    add_risk "DATA"
    add_checklist "Review migration scripts for reversibility"
  fi

  # Services
  if echo "$file" | grep -q "^services/"; then
    add_test "npm run test"
    if echo "$file" | grep -q "^services/litellm/"; then
      add_checklist "Verify LiteLLM model list is fresh"
    fi
  fi

  # CI/Workflows
  if echo "$file" | grep -q "^\.github/workflows/"; then
    add_checklist "Validate workflow YAML syntax"
    add_checklist "Test workflow with a draft PR"
    add_risk "CI"
  fi

  # Dependencies
  if echo "$file" | grep -q "package.json" || echo "$file" | grep -q "package-lock.json"; then
    add_risk "DEPS"
    add_test "npm run check"
    add_checklist "Run 'npm ci' and verify no new vulns (npm audit)"
    add_checklist "Test on a clean node_modules"
  fi

  # Config files
  if echo "$file" | grep -q "\.env" || echo "$file" | grep -q "tsconfig"; then
    add_risk "CONFIG"
    add_checklist "Verify all env vars documented in .env.example"
    add_checklist "Test builds with new config"
  fi

  # Scripts
  if echo "$file" | grep -q "^scripts/"; then
    add_checklist "Test script manually with --help or --base main"
    add_risk "SHARED"
  fi

  # Auth/identity patterns
  if echo "$file" | grep -q "auth" || echo "$file" | grep -q "identity" || echo "$file" | grep -q "middleware" || echo "$file" | grep -q "security"; then
    add_risk "AUTH"
    add_checklist "Test with valid JWT + expired JWT + no token"
  fi

  # Password/secret patterns
  if echo "$file" | grep -q "password" || echo "$file" | grep -q "secret" || echo "$file" | grep -q "token"; then
    add_risk "CONFIG"
    add_checklist "Ensure no secrets hardcoded in code"
  fi

  # Route/endpoint/handler patterns
  if echo "$file" | grep -q "route" || echo "$file" | grep -q "endpoint" || echo "$file" | grep -q "handler"; then
    if echo "$file" | grep -q "\.ts$" || echo "$file" | grep -q "\.tsx$" || echo "$file" | grep -q "\.py$"; then
      add_risk "API"
      add_checklist "Test happy path + error cases"
    fi
  fi

done <<< "$CHANGED_FILES"

# ═══════════════════════════════════════════════════════════════════════════
# COUNT FILES BY CATEGORY
# ═══════════════════════════════════════════════════════════════════════════

total_files=$(printf "%s" "$CHANGED_FILES" | wc -l)

# ═══════════════════════════════════════════════════════════════════════════
# OUTPUT
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "IMPACT GRAPH — CHANGED FILES ANALYSIS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Summary
echo "CHANGED FILES SUMMARY"
echo "───────────────────────────────────────────────────────────────────────"
echo "Total files changed: $total_files"
echo ""
echo "By category:"
echo "$CHANGED_FILES" | grep -q "^apps/" && echo "  • Apps (detected)"
echo "$CHANGED_FILES" | grep -q "^packages/" && echo "  • Packages (detected)"
echo "$CHANGED_FILES" | grep -q "^services/" && echo "  • Services (detected)"
echo "$CHANGED_FILES" | grep -q "^scripts/" && echo "  • Scripts (detected)"
echo "$CHANGED_FILES" | grep -q "^tests/" && echo "  • Tests (detected)"
echo "$CHANGED_FILES" | grep -q "^docs/" && echo "  • Docs (detected)"
echo "$CHANGED_FILES" | grep -q "^\.github/workflows/" && echo "  • CI/Workflows (detected)"
echo "$CHANGED_FILES" | grep -qE "\.(json|yaml|yml|lock)$|\.env" && echo "  • Config (detected)"
echo ""

# Changed files list
echo "Changed files:"
echo "$CHANGED_FILES" | while IFS= read -r file; do
  [ -z "$file" ] && continue
  echo "  • $file"
done
echo ""

# Must-run tests
echo "═══════════════════════════════════════════════════════════════════════"
echo "MUST-RUN TESTS"
echo "═══════════════════════════════════════════════════════════════════════"
test_count=$(wc -l < "$TEMP_TESTS" 2>/dev/null || echo 0)

if [ "$test_count" -eq 0 ]; then
  echo "✅ No mandatory tests identified. (Changes are docs/config only.)"
  echo ""
  echo "→ Recommendation: Run 'npm run lint' before merging."
else
  echo "The following test suites MUST pass before merging:"
  echo ""
  cat "$TEMP_TESTS" | sort -u | while IFS= read -r test; do
    [ -z "$test" ] && continue
    echo "  ▸ $test"
  done
  echo ""
  echo "→ Run all: npm run check"
  echo ""
fi

# High-risk areas
echo "═══════════════════════════════════════════════════════════════════════"
echo "HIGH-RISK AREAS AFFECTED"
echo "═══════════════════════════════════════════════════════════════════════"
risk_count=$(wc -l < "$TEMP_RISKS" 2>/dev/null || echo 0)

if [ "$risk_count" -eq 0 ]; then
  echo "✅ No high-risk areas detected."
else
  echo "⚠️  Review these areas carefully:"
  echo ""
  cat "$TEMP_RISKS" | sort -u | while IFS= read -r risk; do
    [ -z "$risk" ] && continue
    case "$risk" in
      AUTH)   echo "  🔐 AUTH — Changes to authentication, identity, or security" ;;
      DATA)   echo "  💾 DATA — Database migrations or schema changes" ;;
      API)    echo "  📡 API — Route/endpoint handlers or contracts" ;;
      DEPS)   echo "  📦 DEPS — Dependencies, lockfile, or package.json" ;;
      CONFIG) echo "  ⚙️  CONFIG — Environment variables or configuration" ;;
      CI)     echo "  🔄 CI — Workflows or CI/CD pipeline changes" ;;
      SHARED) echo "  🔗 SHARED — Shared packages or infrastructure" ;;
    esac
  done
  echo ""
fi

# Review checklist
echo "═══════════════════════════════════════════════════════════════════════"
echo "REVIEW CHECKLIST"
echo "═══════════════════════════════════════════════════════════════════════"

if [ ! -s "$TEMP_CHECKLIST" ]; then
  echo "✅ No special review items identified."
else
  echo "Before approving this PR, verify:"
  echo ""
  counter=1
  while IFS= read -r item || [ -n "$item" ]; do
    [ -z "$item" ] && continue
    echo "  ☐ $counter. $item"
    counter=$((counter + 1))
  done < <(sort -u "$TEMP_CHECKLIST")
  echo ""
fi

echo "═══════════════════════════════════════════════════════════════════════"
echo ""
