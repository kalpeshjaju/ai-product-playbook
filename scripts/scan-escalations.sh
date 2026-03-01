#!/usr/bin/env bash
##
# FILE PURPOSE: Scan feedback events and the anti-pattern registry for escalation candidates.
#
# WHY: Recurring automatable failure patterns should become automated checks before they
#      reach production again. This script surfaces the signal: which failure classes have
#      happened enough times, are automatable, and have not yet been converted to CI gates.
#
# HOW:
#   1. Reads all docs/feedback/*.json files (excluding schema.json).
#   2. Groups events by rootCauseBucket.
#   3. For each bucket: prints count, automatable flag, and escalation status.
#   4. Flags buckets with 3+ occurrences + automatable=true + escalated=false as "ESCALATE NOW".
#   5. Cross-references docs/LEARNING_JOURNAL.md Anti-Pattern Registry (markdown table).
#      Parses pipe-delimited rows and highlights rows whose Prevention column suggests
#      automation (keywords: "use...instead", "always add", "never", "check before").
#
# USAGE:
#   bash scripts/scan-escalations.sh
#
# EXIT CODES:
#   0 — completed (even if escalations are found — this is a reporting tool, not a gate)
#
# AUTHOR: Claude Sonnet 4.6
# LAST UPDATED: 2026-03-01
##

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FEEDBACK_DIR="$PROJECT_ROOT/docs/feedback"
JOURNAL_FILE="$PROJECT_ROOT/docs/LEARNING_JOURNAL.md"

SEP="══════════════════════════════════════════════════════════════"

# ─── SECTION 1: Feedback Event Analysis ──────────────────────────────────────

echo ""
echo "$SEP"
echo "  ESCALATION SCANNER — Feedback Events"
echo "$SEP"
echo ""

# Collect all feedback JSON files (skip schema.json)
FEEDBACK_FILES=$(find "$FEEDBACK_DIR" -name "*.json" ! -name "schema.json" 2>/dev/null | sort || true)

if [ -z "$FEEDBACK_FILES" ]; then
  echo "  No feedback events found."
  echo "  (Add .json files to docs/feedback/ using the schema at docs/feedback/schema.json)"
  echo ""
else
  # Use Python3 for reliable JSON parsing — shell JSON parsing is fragile (anti-pattern in journal)
  python3 - "$FEEDBACK_FILES" <<'PYEOF'
import sys
import json
import os
from collections import defaultdict

# sys.argv[1] is a space-joined list of file paths passed from the shell here-doc trick.
# We re-derive the list from glob expansion written into the variable.
import glob
feedback_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "feedback")
files = sorted(glob.glob(os.path.join(feedback_dir, "*.json")))
files = [f for f in files if os.path.basename(f) != "schema.json"]

if not files:
    print("  No feedback events found.")
    sys.exit(0)

# Parse all events
events = []
for fpath in files:
    try:
        with open(fpath) as f:
            data = json.load(f)
        data["_file"] = os.path.basename(fpath)
        events.append(data)
    except (json.JSONDecodeError, OSError) as e:
        print(f"  WARN: Could not parse {fpath}: {e}")

if not events:
    print("  No valid feedback events could be parsed.")
    sys.exit(0)

print(f"  Total events loaded: {len(events)}")
print()

# Group by rootCauseBucket
buckets = defaultdict(list)
for ev in events:
    bucket = ev.get("rootCauseBucket", "other")
    buckets[bucket].append(ev)

# Sort by count descending
sorted_buckets = sorted(buckets.items(), key=lambda x: len(x[1]), reverse=True)

ESCALATE_THRESHOLD = 3
escalation_candidates = []

print("  ┌─────────────────────────────────────────────────────────")
print("  │  Bucket breakdown")
print("  └─────────────────────────────────────────────────────────")
print()

for bucket, evs in sorted_buckets:
    count = len(evs)
    # A bucket is "automatable" if ANY event in it marks automatable=True
    automatable = any(e.get("automatable", False) for e in evs)
    # A bucket is "escalated" if ALL automatable events have escalated=True
    automatable_evs = [e for e in evs if e.get("automatable", False)]
    escalated = all(e.get("escalated", False) for e in automatable_evs) if automatable_evs else False

    auto_label  = "automatable=YES" if automatable else "automatable=no"
    esc_label   = "escalated=YES" if escalated else "escalated=no"
    count_label = f"count={count}"

    flag = ""
    if count >= ESCALATE_THRESHOLD and automatable and not escalated:
        flag = "  <<< ESCALATE NOW"
        escalation_candidates.append(bucket)

    print(f"  [{bucket}]")
    print(f"    {count_label}  |  {auto_label}  |  {esc_label}{flag}")

    # Show event summaries
    for ev in evs:
        date    = ev.get("date", "unknown")
        summary = ev.get("summary", "(no summary)")[:80]
        source  = ev.get("source", "?")
        print(f"    - [{date}] ({source}) {summary}")
    print()

if escalation_candidates:
    print("  ══ ESCALATION CANDIDATES (" + str(len(escalation_candidates)) + " buckets) ══")
    for b in escalation_candidates:
        print(f"  * {b} — convert to CI check, pre-commit hook, or ESLint rule")
    print()
else:
    print("  No buckets yet meet the escalation threshold (3+ occurrences, automatable, not yet escalated).")
    print()

PYEOF
fi

# ─── SECTION 2: Anti-Pattern Registry Cross-Reference ────────────────────────

echo "$SEP"
echo "  ANTI-PATTERN REGISTRY — Automation Candidates"
echo "$SEP"
echo ""

if [ ! -f "$JOURNAL_FILE" ]; then
  echo "  ERROR: Learning journal not found at $JOURNAL_FILE"
  echo ""
  exit 1
fi

# Python3 parses the markdown table — sed/awk approach is fragile with pipe-containing content.
# Use a quoted heredoc (<<'PYEOF') so bash does zero interpolation inside the Python source.
# Pass JOURNAL_FILE via the environment to keep the heredoc fully quoted.
export SCAN_JOURNAL_PATH="$JOURNAL_FILE"
python3 - <<'PYEOF'
import re
import sys
import os

journal_path = os.environ["SCAN_JOURNAL_PATH"]

with open(journal_path, "r") as f:
    content = f.read()

# Find the Anti-Pattern Registry section
section_match = re.search(r'## Anti-Pattern Registry.*?(?=\n## |\Z)', content, re.DOTALL)
if not section_match:
    print("  ERROR: Could not locate '## Anti-Pattern Registry' section in the journal.")
    sys.exit(0)

section = section_match.group(0)

# Parse pipe-delimited markdown table rows (skip header and separator lines).
# Pre-process: replace escaped pipes (\|) with a placeholder to avoid spurious splits,
# then restore them after splitting. This handles cells like `\|\|` (escaped || operator).
ESCAPED_PIPE_PLACEHOLDER = "\x00PIPE\x00"
rows = []
for line in section.splitlines():
    line = line.strip()
    # Table row: starts and ends with |
    if not line.startswith("|") or not line.endswith("|"):
        continue
    # Skip separator lines (only contain |, -, and spaces)
    if re.match(r'^[|\-\s]+$', line):
        continue
    # Replace escaped pipes before splitting so they don't create phantom cells
    line_safe = line.replace(r'\|', ESCAPED_PIPE_PLACEHOLDER)
    cells = [c.strip().replace(ESCAPED_PIPE_PLACEHOLDER, '|') for c in line_safe.split("|")]
    # Remove empty first/last cells from leading/trailing pipes
    cells = [c for c in cells if c]
    if not cells:
        continue
    # Skip header row (first cell matches column name)
    if cells[0].lower() in ("anti-pattern", "anti pattern"):
        continue
    rows.append(cells)

if not rows:
    print("  No anti-pattern rows found in the registry table.")
    print()
else:
    print(f"  Total anti-patterns in registry: {len(rows)}")
    print()

# Keywords that indicate a Prevention column recommends automation
AUTOMATION_KEYWORDS = [
    r'use .+ instead',
    r'always add',
    r'always use',
    r'always run',
    r'always wire',
    r'always check',
    r'always enforce',
    r'never ',
    r'check before',
    r'check .+ before',
    r'only .+ via',
    r'run ci in',
    r'run .+ in .+ mode',
    r'grep .+ before',
    r'add .+ step',
    r'add .+ in ',
    r'mock .+ only',
    r'sort by',
    r'strip .+ before',
    r'track .+ rates',
    r'dual-layer',
]

automation_candidates = []
non_automation = []

for row in rows:
    if len(row) < 3:
        continue
    anti_pattern = row[0]
    what_goes_wrong = row[1]
    prevention = row[2]
    date_added = row[3] if len(row) > 3 else ""

    # Check if prevention text matches any automation keyword
    p_lower = prevention.lower()
    matched_keywords = [kw for kw in AUTOMATION_KEYWORDS if re.search(kw, p_lower)]

    if matched_keywords:
        automation_candidates.append({
            "anti_pattern": anti_pattern,
            "prevention": prevention,
            "date_added": date_added,
            "keywords": matched_keywords,
        })
    else:
        non_automation.append({
            "anti_pattern": anti_pattern,
            "prevention": prevention,
            "date_added": date_added,
        })

# Print automation candidates
print("  ── Prevention suggests automation (" + str(len(automation_candidates)) + " patterns) ──")
print()
if automation_candidates:
    for item in automation_candidates:
        date_str = f"  [{item['date_added']}]" if item['date_added'] else ""
        print(f"  PATTERN : {item['anti_pattern']}")
        print(f"  PREVENT : {item['prevention']}{date_str}")
        matched = ", ".join(repr(k) for k in item['keywords'][:3])
        print(f"  KEYWORDS: {matched}")
        print()
else:
    print("  None found.")
    print()

# Print patterns with no clear automation signal
print("  ── Prevention is guidance / requires human judgement (" + str(len(non_automation)) + " patterns) ──")
print()
if non_automation:
    for item in non_automation:
        date_str = f"  [{item['date_added']}]" if item['date_added'] else ""
        print(f"  - {item['anti_pattern']}{date_str}")
        print(f"    {item['prevention']}")
    print()
else:
    print("  None.")
    print()

PYEOF

echo "$SEP"
echo "  Scan complete. To escalate a pattern:"
echo "  1. Create a CI script in scripts/ (use check-*.sh naming convention)"
echo "  2. Update the feedback event's escalated=true and escalatedTo=<path>"
echo "  3. Wire the script to .github/workflows/ci.yml"
echo "$SEP"
echo ""
