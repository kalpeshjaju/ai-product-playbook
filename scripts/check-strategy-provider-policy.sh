#!/usr/bin/env bash
##
# FILE PURPOSE: CI hard gate — enforce strategy provider policy usage
#
# WHY: Composio/OpenPipe/Memory integrations must not silently fail-open in
#      production. Route handlers must use provider policy enforcement.
#
# HOW: Checks provider-policy middleware exists and verifies each strategy
#      route imports and invokes enforceProviderAvailability().
#
# AUTHOR: Codex (GPT-5)
# LAST UPDATED: 2026-03-02
##

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

echo "=== Strategy Provider Policy Check (§20–§22) ==="

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

POLICY_FILE="$ROOT_DIR/apps/api/src/middleware/provider-policy.ts"
COMPOSIO_FILE="$ROOT_DIR/apps/api/src/routes/composio.ts"
OPENPIPE_FILE="$ROOT_DIR/apps/api/src/routes/openpipe.ts"
MEMORY_FILE="$ROOT_DIR/apps/api/src/routes/memory.ts"

require_pattern "$POLICY_FILE" 'export function enforceProviderAvailability' 'provider policy middleware exports enforcement function'
require_pattern "$POLICY_FILE" 'STRATEGY_PROVIDER_MODE' 'provider policy supports STRATEGY_PROVIDER_MODE'

require_pattern "$COMPOSIO_FILE" "enforceProviderAvailability\('composio'" 'composio route enforces provider policy'
require_pattern "$OPENPIPE_FILE" "enforceProviderAvailability\('openpipe'" 'openpipe route enforces provider policy'
require_pattern "$MEMORY_FILE" "enforceProviderAvailability\('memory'" 'memory route enforces provider policy'

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "FAILED — strategy provider policy enforcement is incomplete"
  exit 1
fi

echo "PASS — strategy provider policy enforcement intact"
