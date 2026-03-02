#!/usr/bin/env bash
##
# FILE PURPOSE: Verify live Langfuse availability and API auth
#
# WHY: Strategy observability depends on Langfuse being reachable and accepting
#      API credentials in production.
#
# HOW: Calls Langfuse public health endpoint and authenticated traces endpoint.
#      If credentials are missing and LANGFUSE_LIVE_REQUIRED=true, fails.
#      Otherwise skips non-blocking.
#
# AUTHOR: Codex (GPT-5)
# LAST UPDATED: 2026-03-02
##

set -euo pipefail

HOST="${LANGFUSE_HOST:-}"
PUBLIC_KEY="${LANGFUSE_PUBLIC_KEY:-}"
SECRET_KEY="${LANGFUSE_SECRET_KEY:-}"
REQUIRED_RAW="${LANGFUSE_LIVE_REQUIRED:-false}"
REQUIRED_LOWER="$(printf '%s' "$REQUIRED_RAW" | tr '[:upper:]' '[:lower:]')"

required="false"
case "$REQUIRED_LOWER" in
  true|1|yes) required="true" ;;
  *) required="false" ;;
esac

if [ -z "$HOST" ] || [ -z "$PUBLIC_KEY" ] || [ -z "$SECRET_KEY" ]; then
  if [ "$required" = "true" ]; then
    echo "FAIL: missing Langfuse config (LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY)"
    exit 1
  fi
  echo "SKIP: Langfuse live check not configured (set LANGFUSE_* and LANGFUSE_LIVE_REQUIRED=true to enforce)"
  exit 0
fi

BASE_URL="${HOST%/}"
TMP_HEALTH="$(mktemp)"
TMP_TRACES="$(mktemp)"
trap 'rm -f "$TMP_HEALTH" "$TMP_TRACES"' EXIT

echo "Checking Langfuse health: ${BASE_URL}/api/public/health"
HEALTH_STATUS=$(curl -sS -o "$TMP_HEALTH" -w '%{http_code}' \
  "${BASE_URL}/api/public/health" \
  --max-time 15 || true)

if [ "$HEALTH_STATUS" != "200" ]; then
  echo "FAIL: Langfuse health check returned HTTP ${HEALTH_STATUS}"
  echo "Response: $(cat "$TMP_HEALTH" | head -c 400)"
  exit 1
fi

auth_value=$(printf '%s:%s' "$PUBLIC_KEY" "$SECRET_KEY" | base64 | tr -d '\n')
echo "Checking Langfuse authenticated traces endpoint"
TRACES_STATUS=$(curl -sS -o "$TMP_TRACES" -w '%{http_code}' \
  "${BASE_URL}/api/public/traces?limit=1" \
  -H "Authorization: Basic ${auth_value}" \
  --max-time 20 || true)

if [ "$TRACES_STATUS" != "200" ]; then
  echo "FAIL: Langfuse traces endpoint returned HTTP ${TRACES_STATUS}"
  echo "Response: $(cat "$TMP_TRACES" | head -c 400)"
  exit 1
fi

echo "PASS: Langfuse live verification succeeded"
