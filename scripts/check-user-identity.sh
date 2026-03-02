#!/usr/bin/env bash
##
# FILE PURPOSE: CI hard gate — verify user identity safeguards
#
# WHY: Strategy data quality depends on consistent user identity across auth,
#      logging, and feedback loops.
#
# HOW: Verifies required identity controls remain present in core files:
#      - request auth + ownership checks in server
#      - write-path userId override in generations route
#      - owner enforcement in feedback route
#      - stable hashed identity + trace headers in shared identity module
#
# AUTHOR: Codex (GPT-5)
# LAST UPDATED: 2026-03-02
##

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

echo "=== User Identity Check (§21) ==="

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

require_pattern "$ROOT_DIR/apps/api/src/server.ts" 'authenticateRequest\(req, res, url\)' 'server authenticates requests before route dispatch'
require_pattern "$ROOT_DIR/apps/api/src/server.ts" 'verifyUserOwnership\(url, authResult\.userContext\.userId\)' 'server enforces user ownership checks (IDOR protection)'

require_pattern "$ROOT_DIR/apps/api/src/routes/generations.ts" 'validated\.userId = authResult\.userContext\.userId' 'generation writes override body.userId with authenticated identity'

require_pattern "$ROOT_DIR/apps/api/src/routes/feedback.ts" 'generation\.userId !== authenticatedUserId' 'feedback outcome route checks ownership'
require_pattern "$ROOT_DIR/apps/api/src/routes/feedback.ts" 'existing\.userId !== authenticatedUserId' 'feedback patch route checks ownership'

require_pattern "$ROOT_DIR/packages/shared-llm/src/identity/context.ts" 'function hashApiKey\(' 'API key identities are hashed (no raw key identity)'
require_pattern "$ROOT_DIR/packages/shared-llm/src/identity/context.ts" "'x-litellm-user': user\.userId" 'trace headers include stable user identity'

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "FAILED — identity safeguards missing"
  exit 1
fi

echo "PASS — user identity safeguards intact"
