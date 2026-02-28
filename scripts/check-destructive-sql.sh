#!/usr/bin/env bash
# Check for destructive SQL: block DROP TABLE, TRUNCATE, DELETE without WHERE.
#
# WHY: Prevents accidental data loss from SQL in migrations or schema files.
#      Allows destructive SQL inside `-- migration:down` blocks (rollbacks are OK).
# HOW: Scans *.sql and Drizzle schema/migration TS files for dangerous patterns.
#
# USAGE: bash scripts/check-destructive-sql.sh
# EXIT: 0 = pass, 1 = destructive SQL found without rollback pair
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01

set -euo pipefail

FAILED=0
DETAILS=""

# Find SQL and Drizzle schema/migration files
SQL_FILES=$(find . -type f -name '*.sql' ! -path '*/node_modules/*' 2>/dev/null || true)
DRIZZLE_FILES=$(find . -type f \( -name 'schema.ts' -o -name 'schema.js' -o -path '*/migrations/*' \) \
  ! -path '*/node_modules/*' 2>/dev/null || true)

ALL_FILES="$SQL_FILES $DRIZZLE_FILES"

for file in $ALL_FILES; do
  [ -z "$file" ] && continue
  [ ! -f "$file" ] && continue

  # Read file content
  content=$(cat "$file" 2>/dev/null || true)
  [ -z "$content" ] && continue

  # Check for DROP TABLE (case-insensitive)
  while IFS= read -r line_num; do
    # Get the line content
    line=$(sed -n "${line_num}p" "$file")

    # Skip if inside a migration:down block comment
    # Look backwards for `-- migration:down` without a subsequent `-- migration:up`
    head_content=$(head -n "$line_num" "$file")
    if echo "$head_content" | grep -qi '\-\- migration:down'; then
      last_down=$(echo "$head_content" | grep -ni '\-\- migration:down' | tail -1 | cut -d: -f1)
      last_up=$(echo "$head_content" | grep -ni '\-\- migration:up' | tail -1 | cut -d: -f1)
      if [ -n "$last_down" ] && { [ -z "$last_up" ] || [ "$last_down" -gt "$last_up" ]; }; then
        continue
      fi
    fi

    # Skip if it's a comment line
    stripped=$(echo "$line" | sed 's/^[[:space:]]*//')
    case "$stripped" in
      --*|//*|\#*) continue ;;
    esac

    DETAILS="${DETAILS}\n  ${file}:${line_num} — DROP TABLE detected: ${line}"
    FAILED=1
  done < <(grep -ni 'DROP[[:space:]]\+TABLE' "$file" 2>/dev/null | cut -d: -f1 || true)

  # Check for TRUNCATE (case-insensitive)
  while IFS= read -r line_num; do
    line=$(sed -n "${line_num}p" "$file")

    head_content=$(head -n "$line_num" "$file")
    if echo "$head_content" | grep -qi '\-\- migration:down'; then
      last_down=$(echo "$head_content" | grep -ni '\-\- migration:down' | tail -1 | cut -d: -f1)
      last_up=$(echo "$head_content" | grep -ni '\-\- migration:up' | tail -1 | cut -d: -f1)
      if [ -n "$last_down" ] && { [ -z "$last_up" ] || [ "$last_down" -gt "$last_up" ]; }; then
        continue
      fi
    fi

    stripped=$(echo "$line" | sed 's/^[[:space:]]*//')
    case "$stripped" in
      --*|//*|\#*) continue ;;
    esac

    DETAILS="${DETAILS}\n  ${file}:${line_num} — TRUNCATE detected: ${line}"
    FAILED=1
  done < <(grep -ni 'TRUNCATE' "$file" 2>/dev/null | cut -d: -f1 || true)

  # Check for DELETE FROM without WHERE (case-insensitive)
  while IFS= read -r line_num; do
    line=$(sed -n "${line_num}p" "$file")

    # Check if WHERE exists on this line or the next few lines
    context=$(sed -n "${line_num},$((line_num + 3))p" "$file")
    if echo "$context" | grep -qi 'WHERE'; then
      continue
    fi

    head_content=$(head -n "$line_num" "$file")
    if echo "$head_content" | grep -qi '\-\- migration:down'; then
      last_down=$(echo "$head_content" | grep -ni '\-\- migration:down' | tail -1 | cut -d: -f1)
      last_up=$(echo "$head_content" | grep -ni '\-\- migration:up' | tail -1 | cut -d: -f1)
      if [ -n "$last_down" ] && { [ -z "$last_up" ] || [ "$last_down" -gt "$last_up" ]; }; then
        continue
      fi
    fi

    stripped=$(echo "$line" | sed 's/^[[:space:]]*//')
    case "$stripped" in
      --*|//*|\#*) continue ;;
    esac

    DETAILS="${DETAILS}\n  ${file}:${line_num} — DELETE without WHERE: ${line}"
    FAILED=1
  done < <(grep -ni 'DELETE[[:space:]]\+FROM' "$file" 2>/dev/null | cut -d: -f1 || true)
done

if [ "$FAILED" -eq 1 ]; then
  echo "❌ check-destructive-sql: destructive SQL found"
  printf "%b\n" "$DETAILS"
  echo ""
  echo "Fix: Add a WHERE clause, move to a -- migration:down block, or remove the statement."
  exit 1
fi

echo "✅ check-destructive-sql: no unguarded destructive SQL found"
exit 0
