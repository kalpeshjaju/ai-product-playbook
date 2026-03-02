#!/usr/bin/env bash
##
# FILE PURPOSE: Orchestrator for full-stack E2E infrastructure tests
#
# WHY: Runs all three test layers against real infrastructure:
#      Layer 1 — Vitest API contract tests (fetch → API → Postgres/Redis)
#      Layer 2 — Playwright full-stack browser tests (browser → Next.js → API → DB)
#
# HOW: Requires Docker stack running (`docker compose up -d`).
#      This script verifies services, runs tests, and reports results.
#
# USAGE:
#   bash scripts/test-e2e-infra.sh              # Run all layers (requires Docker)
#   bash scripts/test-e2e-infra.sh --api        # Layer 1 only (API contract tests)
#   bash scripts/test-e2e-infra.sh --browser    # Layer 2 only (Playwright browser tests)
#   bash scripts/test-e2e-infra.sh --no-docker  # Skip Docker checks (CI or external services)
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01
##

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────
API_URL="${E2E_API_URL:-http://localhost:3002}"
WEB_URL="${E2E_WEB_URL:-http://localhost:3000}"
ADMIN_URL="${E2E_ADMIN_URL:-http://localhost:3001}"
HEALTH_TIMEOUT=30
LAYER="all"
SKIP_DOCKER=false

for arg in "$@"; do
  case "$arg" in
    --api)        LAYER="api" ;;
    --browser)    LAYER="browser" ;;
    --no-docker)  SKIP_DOCKER=true ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── Health check helper ─────────────────────────────────────
wait_for_service() {
  local url="$1"
  local name="$2"
  local elapsed=0

  log_info "Waiting for $name at $url ..."
  while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      log_info "$name is ready (${elapsed}s)"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  log_error "$name not ready after ${HEALTH_TIMEOUT}s"
  return 1
}

# ─── Pre-flight checks ───────────────────────────────────────
preflight() {
  log_info "Running pre-flight checks..."

  if [ "$SKIP_DOCKER" = true ]; then
    log_info "Skipping Docker checks (--no-docker)"
  else
    # Check Docker is running
    if ! docker info > /dev/null 2>&1; then
      log_error "Docker is not running. Start Docker and run: docker compose up -d"
      log_error "Or use --no-docker if services are running externally (e.g. CI)."
      exit 1
    fi

    # Check required containers
    local running
    running=$(docker compose ps --status running --format '{{.Name}}' 2>/dev/null | wc -l)
    if [ "$running" -lt 3 ]; then
      log_warn "Expected 3+ running containers, found $running."
      log_warn "Run: docker compose up -d"
      log_warn "Continuing anyway — services may be running outside Docker."
    fi
  fi

  # Wait for API health
  wait_for_service "${API_URL}/api/health" "API server"
}

# ─── Layer 1: API contract tests (Vitest) ─────────────────────
run_api_tests() {
  log_info "━━━ Layer 1: API Contract Tests (Vitest) ━━━"
  E2E_API_URL="$API_URL" npx vitest run --config vitest.e2e.config.ts
}

# ─── Layer 2: Full-stack browser tests (Playwright) ──────────
run_browser_tests() {
  log_info "━━━ Layer 2: Full-Stack Browser Tests (Playwright) ━━━"

  # Verify web and admin servers
  wait_for_service "$WEB_URL" "Web app (port 3000)"
  wait_for_service "$ADMIN_URL" "Admin app (port 3001)"

  npx playwright test --config=playwright.e2e.config.ts
}

# ─── Main ─────────────────────────────────────────────────────
main() {
  log_info "AI Product Playbook — E2E Infrastructure Tests"
  echo ""

  preflight

  case "$LAYER" in
    api)
      run_api_tests
      ;;
    browser)
      run_browser_tests
      ;;
    all)
      run_api_tests
      echo ""
      run_browser_tests
      ;;
  esac

  echo ""
  log_info "All E2E infrastructure tests passed."
}

main
