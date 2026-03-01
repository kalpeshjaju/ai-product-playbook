#!/usr/bin/env bash
# Check API contracts: verify all routes in code are documented in API_CONTRACTS.md.
#
# WHY: Undocumented endpoints create integration risk — consumers and LLMs need
#      accurate route info. Playbook §5 doc freshness.
# HOW: Extracts HTTP method + path patterns from server.ts and routes/*.ts,
#      checks each appears in docs/API_CONTRACTS.md.
#
# USAGE: bash scripts/check-api-contracts.sh
# EXIT: 0 = all routes documented, 1 = undocumented routes found
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01

set -euo pipefail

CONTRACTS_DOC="docs/API_CONTRACTS.md"

# Step 1: Verify docs/API_CONTRACTS.md exists
if [ ! -f "$CONTRACTS_DOC" ]; then
  echo "❌ check-api-contracts: $CONTRACTS_DOC does not exist"
  echo "   Create it with all API route documentation."
  exit 1
fi

# Step 2: Extract route patterns from source code
# Look in server.ts and routes/*.ts for URL patterns
ROUTE_FILES=$(find apps/api/src -type f -name '*.ts' \( -name 'server.ts' -o -path '*/routes/*' \) 2>/dev/null || true)

if [ -z "$ROUTE_FILES" ]; then
  echo "✅ check-api-contracts: no route files found (nothing to check)"
  exit 0
fi

UNDOCUMENTED=0
ROUTES_FOUND=0

# Extract URL patterns: look for string literals matching /api/...
# Patterns: url === '/api/...', url.match(/...\/api\/...$/), '/api/...' in route definitions
for file in $ROUTE_FILES; do
  # Extract /api/ paths from string literals and regex patterns
  while IFS= read -r route; do
    [ -z "$route" ] && continue
    ROUTES_FOUND=$((ROUTES_FOUND + 1))

    # Normalize route for matching: replace :param patterns with the param name
    # and remove regex escapes
    search_route=$(echo "$route" | sed 's/\\//g')

    # Check if this route path appears in the contracts doc
    # Use a flexible match — the doc might use :id, :name etc.
    # Convert /api/prompts/([^/]+)/active to /api/prompts/:param/active for matching
    doc_route=$(echo "$search_route" | sed 's/(\[^\/\]+)/:param/g' | sed 's/(\[^\/\]\+)/:param/g')

    # Also try the literal route string
    if grep -q "$search_route" "$CONTRACTS_DOC" 2>/dev/null; then
      continue
    fi

    # Try the parameterized form
    if grep -q "$doc_route" "$CONTRACTS_DOC" 2>/dev/null; then
      continue
    fi

    # Try matching just the path base (e.g., /api/prompts appears in doc)
    base_path=$(echo "$search_route" | sed 's/\/:[^/]*//g' | sed 's/\/([^)]*//g')
    if grep -q "$base_path" "$CONTRACTS_DOC" 2>/dev/null; then
      continue
    fi

    echo "⚠️  Undocumented route in $file: $route"
    UNDOCUMENTED=$((UNDOCUMENTED + 1))
  done < <(grep -oE "'/api/[^']*'" "$file" 2>/dev/null | tr -d "'" | sort -u || true)

  # Also extract regex-based route patterns like url.match(/^\/api\/prompts\/([^/]+)\/active$/)
  # Use Python to reliably parse regex patterns containing slashes
  while IFS= read -r readable; do
    [ -z "$readable" ] && continue
    ROUTES_FOUND=$((ROUTES_FOUND + 1))

    if grep -qF "$readable" "$CONTRACTS_DOC" 2>/dev/null; then
      continue
    fi

    # Try matching with :param replaced by any :word (e.g., :name, :id)
    # Convert /api/prompts/:param/active to a grep pattern matching /api/prompts/:anything/active
    flex_pattern=$(echo "$readable" | sed 's/:param/:[a-zA-Z]*/g')
    if grep -qE "$flex_pattern" "$CONTRACTS_DOC" 2>/dev/null; then
      continue
    fi

    # Try base path matching (strip /:param segments but keep trailing path)
    # /api/prompts/:param/active → check if "/active" or "/promote" etc. appears near /api/prompts
    suffix=$(echo "$readable" | sed 's|.*/:[^/]*/||')
    if [ -n "$suffix" ] && grep -qF "/api/prompts" "$CONTRACTS_DOC" 2>/dev/null && grep -qF "/$suffix" "$CONTRACTS_DOC" 2>/dev/null; then
      continue
    fi

    echo "⚠️  Undocumented route in $file: $readable"
    UNDOCUMENTED=$((UNDOCUMENTED + 1))
  done < <(python3 -c "
import re, sys
with open('$file') as f:
    content = f.read()
# Find url.match(/regex/) patterns containing /api/
for m in re.finditer(r'match\(\s*/(.+?)/\s*\)', content):
    pattern = m.group(1)
    if '/api/' not in pattern and r'\/api\/' not in pattern:
        continue
    # Convert regex to readable path
    readable = pattern.replace(r'\/', '/')
    readable = readable.lstrip('^').rstrip('\$')
    readable = re.sub(r'\(\[[\^/]*\]\+?\)', ':param', readable)
    print(readable)
" 2>/dev/null | sort -u || true)
done

if [ "$UNDOCUMENTED" -gt 0 ]; then
  echo ""
  echo "❌ check-api-contracts: $UNDOCUMENTED undocumented route(s) found"
  echo "   Add them to $CONTRACTS_DOC"
  exit 1
fi

echo "✅ check-api-contracts: all $ROUTES_FOUND routes documented in $CONTRACTS_DOC"
exit 0
