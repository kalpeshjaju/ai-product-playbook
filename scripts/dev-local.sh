#!/bin/bash
##
# FILE PURPOSE: Local development setup without Docker
#
# WHY: Enables local dev with Homebrew-installed Postgres and Redis.
#      No Docker Desktop required. See DEC-006 for Strapi status.
#
# HOW: Checks prerequisites, creates database, applies schema,
#      starts API server with correct env vars.
#
# USAGE:
#   ./scripts/dev-local.sh          # Full setup + start API
#   ./scripts/dev-local.sh --check  # Check prerequisites only
#
# PREREQUISITES (macOS):
#   brew install postgresql@17 redis
#   brew services start postgresql@17
#   brew services start redis
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01
##

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────
DB_NAME="${POSTGRES_DB:-playbook}"
DB_USER="${POSTGRES_USER:-$(whoami)}"
DB_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
API_PORT="${API_PORT:-3002}"

export DATABASE_URL="postgres://${DB_USER}@localhost:${DB_PORT}/${DB_NAME}"
export REDIS_URL="redis://localhost:${REDIS_PORT}"
export NODE_ENV=development

# ─── Colors ────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

# ─── Prerequisite checks ──────────────────────────────────────
echo "Checking prerequisites..."

MISSING=0

# Postgres
if command -v psql &>/dev/null; then
  PG_VERSION=$(psql --version 2>/dev/null | head -1)
  ok "PostgreSQL: ${PG_VERSION}"
else
  fail "PostgreSQL not found. Install: brew install postgresql@17"
  MISSING=1
fi

# pgvector extension
if command -v psql &>/dev/null; then
  if psql -d postgres -tAc "SELECT 1 FROM pg_available_extensions WHERE name='vector'" 2>/dev/null | grep -q 1; then
    ok "pgvector extension available"
  else
    fail "pgvector not found. Install: brew install pgvector"
    MISSING=1
  fi
fi

# Redis
if command -v redis-cli &>/dev/null; then
  if redis-cli -p "$REDIS_PORT" ping 2>/dev/null | grep -q PONG; then
    ok "Redis running on port ${REDIS_PORT}"
  else
    fail "Redis not responding. Start: brew services start redis"
    MISSING=1
  fi
else
  fail "Redis not found. Install: brew install redis"
  MISSING=1
fi

# Node.js
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  ok "Node.js: ${NODE_VERSION}"
else
  fail "Node.js not found"
  MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo -e "${RED}Missing prerequisites. Install them and re-run.${NC}"
  exit 1
fi

if [ "${1:-}" = "--check" ]; then
  echo ""
  echo -e "${GREEN}All prerequisites met.${NC}"
  exit 0
fi

# ─── Database setup ───────────────────────────────────────────
echo ""
echo "Setting up database..."

# Create database if it doesn't exist
if psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  ok "Database '${DB_NAME}' exists"
else
  createdb "$DB_NAME"
  ok "Created database '${DB_NAME}'"
fi

# Enable pgvector extension
psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" &>/dev/null
ok "pgvector extension enabled"

# Apply Drizzle schema
echo "Applying schema via drizzle-kit push..."
npx drizzle-kit push --config apps/api/drizzle.config.ts 2>&1 | tail -3
ok "Schema applied"

# ─── Build ────────────────────────────────────────────────────
echo ""
echo "Building API and dependencies..."
npx turbo run build --filter=@playbook/api... 2>&1 | tail -5
ok "Build complete"

# ─── Start ────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}Starting API server on port ${API_PORT}...${NC}"
echo "  DATABASE_URL=${DATABASE_URL}"
echo "  REDIS_URL=${REDIS_URL}"
echo "  NODE_ENV=${NODE_ENV}"
echo ""
echo "Press Ctrl+C to stop."
echo ""

exec node apps/api/dist/server.js
