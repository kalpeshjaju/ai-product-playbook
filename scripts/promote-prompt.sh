#!/usr/bin/env bash
# Promote a prompt version through the promotion ladder: 0% → 10% → 50% → 100%.
#
# WHY: Provides a CLI interface for the prompt promotion API, usable from CI
#      or manual invocation. Simplifies the promotion workflow.
# HOW: Calls POST /api/prompts/:name/promote with the latest version.
#
# USAGE:
#   bash scripts/promote-prompt.sh <prompt_name> [--version VERSION] [--api-url URL]
#
# EXAMPLES:
#   bash scripts/promote-prompt.sh job-classifier
#   bash scripts/promote-prompt.sh job-classifier --version v1.3.0
#   bash scripts/promote-prompt.sh job-classifier --api-url http://localhost:3002
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01

set -euo pipefail

# Defaults
API_URL="http://localhost:3002"
PROMPT_NAME=""
VERSION=""

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: bash scripts/promote-prompt.sh <prompt_name> [--version VERSION] [--api-url URL]"
      echo ""
      echo "Promotes a prompt version through the ladder: 0% → 10% → 50% → 100%"
      echo ""
      echo "Options:"
      echo "  --version VERSION   Specific version to promote (required)"
      echo "  --api-url URL       API base URL (default: http://localhost:3002)"
      echo "  --help, -h          Show this help"
      exit 0
      ;;
    *)
      if [ -z "$PROMPT_NAME" ]; then
        PROMPT_NAME="$1"
      fi
      shift
      ;;
  esac
done

if [ -z "$PROMPT_NAME" ]; then
  echo "❌ Error: prompt_name is required"
  echo "Usage: bash scripts/promote-prompt.sh <prompt_name> --version <version>"
  exit 1
fi

if [ -z "$VERSION" ]; then
  echo "❌ Error: --version is required"
  echo "Usage: bash scripts/promote-prompt.sh $PROMPT_NAME --version <version>"
  exit 1
fi

ENCODED_NAME=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PROMPT_NAME'))")
URL="${API_URL}/api/prompts/${ENCODED_NAME}/promote"

echo "Promoting prompt: $PROMPT_NAME (version: $VERSION)"
echo "API: $URL"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"version\": \"$VERSION\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  PREV=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('previousPct','?'))")
  NEW=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('newPct','?'))")
  NEXT=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('nextStep',''))")

  echo "✅ Promoted: ${PREV}% → ${NEW}%"
  echo "   Next: $NEXT"
else
  ERROR=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','Unknown error'))" 2>/dev/null || echo "$BODY")
  echo "❌ Promotion failed (HTTP $HTTP_CODE): $ERROR"
  exit 1
fi
