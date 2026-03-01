#!/usr/bin/env bash
# capture-feedback.sh — Captures typed feedback events to docs/feedback/
#
# WHY: The LLM Coding Framework requires every CI failure, PR review finding,
#      and session reflection to be recorded as a structured JSON event. Over
#      time these events reveal recurring failure patterns (rootCauseBucket
#      recurrence) and drive automated escalation into CI checks or lint rules.
#
# HOW: Accepts flags for event metadata, validates inputs against allowed enums,
#      writes a JSON file named YYYYMMDD-HHMMSS-<type>.json to docs/feedback/,
#      counts prior events with the same rootCauseBucket, and warns when a
#      pattern has recurred 3+ times (ESCALATION THRESHOLD REACHED).
#      Uses python3 for all JSON generation to avoid shell-escaping pitfalls.
#
# USAGE:
#   bash scripts/capture-feedback.sh \
#     --type ci-failure \
#     --source ci \
#     --summary "Import for @playbook/utils resolved to missing package" \
#     --root-cause "LLM generated import path that does not exist in workspace" \
#     --bucket hallucinated-import \
#     --files "apps/api/src/routes/prompts.ts" \
#     --automatable true \
#     --automatable-as ci-script
#
# AUTHOR: Claude Sonnet 4.6
# LAST UPDATED: 2026-03-01

set -euo pipefail

# ─── Constants ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FEEDBACK_DIR="$PROJECT_ROOT/docs/feedback"

VALID_TYPES="ci-failure pr-review-finding prove-it-failure session-reflect anti-pattern-discovered"
VALID_SOURCES="claude codex cursor gemini coderabbit ci human"
VALID_BUCKETS="hallucinated-import env-drift stub-shipped test-gap type-error auth-bypass response-shape-change timeout-mismatch missing-dependency config-mismatch other"

# ─── Defaults ──────────────────────────────────────────────────────────────────
TYPE=""
SOURCE=""
SUMMARY=""
ROOT_CAUSE=""
BUCKET="other"
FILES=""
AUTOMATABLE="false"
AUTOMATABLE_AS="not-automatable"

# ─── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --type)           TYPE="$2";           shift 2 ;;
    --source)         SOURCE="$2";         shift 2 ;;
    --summary)        SUMMARY="$2";        shift 2 ;;
    --root-cause)     ROOT_CAUSE="$2";     shift 2 ;;
    --bucket)         BUCKET="$2";         shift 2 ;;
    --files)          FILES="$2";          shift 2 ;;
    --automatable)    AUTOMATABLE="$2";    shift 2 ;;
    --automatable-as) AUTOMATABLE_AS="$2"; shift 2 ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ─── Validation helper ──────────────────────────────────────────────────────────
contains() {
  local needle="$1"
  local haystack="$2"
  for item in $haystack; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

# ─── Required args check ────────────────────────────────────────────────────────
MISSING_ARGS=""
[[ -z "$TYPE" ]]    && MISSING_ARGS="$MISSING_ARGS --type"
[[ -z "$SOURCE" ]]  && MISSING_ARGS="$MISSING_ARGS --source"
[[ -z "$SUMMARY" ]] && MISSING_ARGS="$MISSING_ARGS --summary"

if [[ -n "$MISSING_ARGS" ]]; then
  echo "ERROR: Missing required arguments:$MISSING_ARGS" >&2
  echo "" >&2
  echo "Usage: bash scripts/capture-feedback.sh --type <type> --source <source> --summary <text> [options]" >&2
  exit 1
fi

# ─── Enum validation ────────────────────────────────────────────────────────────
if ! contains "$TYPE" "$VALID_TYPES"; then
  echo "ERROR: Invalid --type '$TYPE'" >&2
  echo "Valid types: $VALID_TYPES" >&2
  exit 1
fi

if ! contains "$SOURCE" "$VALID_SOURCES"; then
  echo "ERROR: Invalid --source '$SOURCE'" >&2
  echo "Valid sources: $VALID_SOURCES" >&2
  exit 1
fi

if ! contains "$BUCKET" "$VALID_BUCKETS"; then
  echo "ERROR: Invalid --bucket '$BUCKET'" >&2
  echo "Valid buckets: $VALID_BUCKETS" >&2
  exit 1
fi

# ─── Normalize automatable flag ─────────────────────────────────────────────────
case "$AUTOMATABLE" in
  true|yes|1)  AUTOMATABLE_BOOL="True" ;;
  false|no|0)  AUTOMATABLE_BOOL="False" ;;
  *)
    echo "ERROR: --automatable must be true or false (got '$AUTOMATABLE')" >&2
    exit 1
    ;;
esac

# ─── Ensure output directory exists ────────────────────────────────────────────
mkdir -p "$FEEDBACK_DIR"

# ─── Count recurrence: existing JSON files matching this bucket ─────────────────
# Use python3 to parse each JSON file safely — avoids grep exit-1 with set -e
RECURRENCE=$(python3 - "$FEEDBACK_DIR" "$BUCKET" <<'PYEOF'
import json
import os
import sys

feedback_dir = sys.argv[1]
bucket       = sys.argv[2]
count        = 0

for fname in os.listdir(feedback_dir):
    if not fname.endswith(".json") or fname == "schema.json":
        continue
    fpath = os.path.join(feedback_dir, fname)
    try:
        with open(fpath) as f:
            data = json.load(f)
        if data.get("rootCauseBucket") == bucket:
            count += 1
    except (json.JSONDecodeError, OSError):
        pass

print(count)
PYEOF
)

# ─── Build filename: YYYYMMDD-HHMMSS-<type>.json ──────────────────────────────
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
OUTFILE="${FEEDBACK_DIR}/${TIMESTAMP}-${TYPE}.json"

# ─── Generate JSON via python3 and write to file ────────────────────────────────
# All string values are passed via environment variables — no shell interpolation
# inside the Python source — which eliminates escaping issues entirely.
CAPTURE_SUMMARY="$SUMMARY" \
CAPTURE_ROOT_CAUSE="$ROOT_CAUSE" \
CAPTURE_BUCKET="$BUCKET" \
CAPTURE_TYPE="$TYPE" \
CAPTURE_SOURCE="$SOURCE" \
CAPTURE_FILES="$FILES" \
CAPTURE_AUTOMATABLE="$AUTOMATABLE_BOOL" \
CAPTURE_AUTOMATABLE_AS="$AUTOMATABLE_AS" \
CAPTURE_RECURRENCE="$RECURRENCE" \
CAPTURE_TIMESTAMP="$TIMESTAMP" \
CAPTURE_OUTFILE="$OUTFILE" \
python3 <<'PYEOF'
import json
import os

summary        = os.environ["CAPTURE_SUMMARY"]
root_cause     = os.environ["CAPTURE_ROOT_CAUSE"]
bucket         = os.environ["CAPTURE_BUCKET"]
event_type     = os.environ["CAPTURE_TYPE"]
source         = os.environ["CAPTURE_SOURCE"]
files_raw      = os.environ["CAPTURE_FILES"]
automatable    = os.environ["CAPTURE_AUTOMATABLE"] == "True"
automatable_as = os.environ["CAPTURE_AUTOMATABLE_AS"]
recurrence     = int(os.environ["CAPTURE_RECURRENCE"]) + 1  # +1 for this new event
timestamp      = os.environ["CAPTURE_TIMESTAMP"]
outfile        = os.environ["CAPTURE_OUTFILE"]

# Derive ISO date from YYYYMMDD-HHMMSS
date_str = f"{timestamp[0:4]}-{timestamp[4:6]}-{timestamp[6:8]}"

# Parse files: comma- or space-separated list (supports a single file or many)
files_involved = []
if files_raw.strip():
    for f in files_raw.replace(",", " ").split():
        f = f.strip()
        if f:
            files_involved.append(f)

event = {
    "date": date_str,
    "type": event_type,
    "source": source,
    "summary": summary,
    "rootCauseBucket": bucket,
    "filesInvolved": files_involved,
    "automatable": automatable,
    "automatableAs": automatable_as,
    "recurrenceCount": recurrence,
    "escalated": False,
}

# Only include rootCause if a value was provided
if root_cause.strip():
    event["rootCause"] = root_cause

with open(outfile, "w") as fh:
    json.dump(event, fh, indent=2, ensure_ascii=False)
    fh.write("\n")

print(json.dumps(event, indent=2, ensure_ascii=False))
PYEOF

# ─── Output summary ─────────────────────────────────────────────────────────────
echo ""
echo "Feedback event written: $OUTFILE"
echo "  type:             $TYPE"
echo "  source:           $SOURCE"
echo "  bucket:           $BUCKET"
echo "  recurrenceCount:  $((RECURRENCE + 1))"

# ─── Escalation threshold check ─────────────────────────────────────────────────
TOTAL_RECURRENCE=$((RECURRENCE + 1))
if [[ "$TOTAL_RECURRENCE" -ge 3 ]]; then
  echo ""
  echo "WARNING: ESCALATION THRESHOLD REACHED"
  echo "  The '$BUCKET' bucket has now recurred $TOTAL_RECURRENCE time(s)."
  echo "  Action required: Convert this failure pattern into an automated check."
  echo "  Candidates: eslint-rule, pre-commit-hook, ci-script, coderabbit-instruction, claude-md-rule"
fi
