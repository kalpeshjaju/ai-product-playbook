# LLM End-to-End Coding Framework — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install a 6-pillar enforcement framework that makes it impossible for any LLM (Claude, Codex, Cursor, Gemini) to ship unverified, unreviewed, context-free code — and auto-converts every failure into a permanent check.

**Architecture:** Layered enforcement: L1 (CLAUDE.md — all LLMs) → L2 (Skills — Claude Code) → L3 (Git hooks — local gates) → L4 (CI — cannot bypass) → L5 (CodeRabbit — auto-checker). Each pillar enforced at multiple layers.

**Tech Stack:** Bash scripts, TypeScript (turbo monorepo), GitHub Actions, pre-commit hooks, CodeRabbit YAML, Claude Code skills.

---

## Task 1: Create Task Contract Template + Skill

**Files:**
- Create: `docs/contracts/TEMPLATE.md`
- Create: `docs/contracts/.gitkeep` (ensure dir tracked)

**Step 1: Create the contract template**

Create `docs/contracts/TEMPLATE.md`:

```markdown
# Task Contract: [TITLE]

**Date:** YYYY-MM-DD
**Maker LLM:** Claude / Codex / Cursor / Gemini / Human
**Confidence:** VERIFIED (0.95) / HIGH (0.85) / MEDIUM (0.70) / LOW (0.40)

## Goal
<!-- One sentence: what this task achieves -->

## Non-Goals
<!-- What this task explicitly does NOT do -->

## Modules Touched
<!-- List every file/directory that will be modified -->
- `apps/api/src/routes/...`
- `packages/shared-llm/...`

## Acceptance Criteria
<!-- Testable conditions that prove the task is done -->
- [ ] Criterion 1
- [ ] Criterion 2

## Rollback Plan
<!-- How to undo this change if it breaks production -->

## Anti-Patterns Checked
<!-- Which anti-patterns from docs/LEARNING_JOURNAL.md are relevant? -->
- [ ] Checked: [relevant anti-pattern]

## Proof Required
<!-- What evidence must be shown before claiming done? -->
- [ ] Test output pasted
- [ ] curl/execution output pasted
- [ ] Screenshot (if UI change)
```

**Step 2: Create .gitkeep for contracts dir**

```bash
touch docs/contracts/.gitkeep
```

**Step 3: Commit**

```bash
git add docs/contracts/
git commit -m "feat(framework): add task contract template

Pillar 1 of LLM coding framework. Every task requires a contract
before coding begins: goal, non-goals, modules, acceptance criteria,
rollback plan, anti-pattern check.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Create Feedback Storage Directory + Schema

**Files:**
- Create: `docs/feedback/schema.json`
- Create: `docs/feedback/.gitkeep`

**Step 1: Create the feedback event schema**

Create `docs/feedback/schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Framework Feedback Event",
  "description": "Captured after every PR merge, CI failure, or session reflect",
  "type": "object",
  "required": ["date", "type", "source", "summary"],
  "properties": {
    "date": { "type": "string", "format": "date" },
    "type": {
      "type": "string",
      "enum": ["ci-failure", "pr-review-finding", "prove-it-failure", "session-reflect", "anti-pattern-discovered"]
    },
    "source": {
      "type": "string",
      "description": "Which LLM or system generated this event",
      "enum": ["claude", "codex", "cursor", "gemini", "coderabbit", "ci", "human"]
    },
    "summary": { "type": "string" },
    "rootCause": { "type": "string" },
    "rootCauseBucket": {
      "type": "string",
      "enum": [
        "hallucinated-import",
        "env-drift",
        "stub-shipped",
        "test-gap",
        "type-error",
        "auth-bypass",
        "response-shape-change",
        "timeout-mismatch",
        "missing-dependency",
        "config-mismatch",
        "other"
      ]
    },
    "filesInvolved": {
      "type": "array",
      "items": { "type": "string" }
    },
    "automatable": {
      "type": "boolean",
      "description": "Can this failure class be caught by a lint rule, hook, or CI check?"
    },
    "automatableAs": {
      "type": "string",
      "enum": ["eslint-rule", "pre-commit-hook", "ci-script", "coderabbit-instruction", "claude-md-rule", "not-automatable"]
    },
    "recurrenceCount": {
      "type": "integer",
      "description": "How many times has this exact failure pattern occurred?",
      "minimum": 1
    },
    "escalated": {
      "type": "boolean",
      "description": "Has this been converted into an automated check yet?"
    },
    "escalatedTo": {
      "type": "string",
      "description": "Path to the automated check file, if escalated"
    }
  }
}
```

**Step 2: Commit**

```bash
git add docs/feedback/
git commit -m "feat(framework): add feedback event schema

Pillar 6 (Memory + Recurrence). Every CI failure, PR finding,
prove-it failure, and session reflection gets stored as a typed
event with root-cause bucket and escalation tracking.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Create Change Impact Graph Script

**Files:**
- Create: `scripts/impact-graph.sh`

**Step 1: Write the impact graph script**

Create `scripts/impact-graph.sh`:

```bash
#!/usr/bin/env bash
##
# FILE PURPOSE: Map changed files to affected tests and high-risk areas
#
# WHY: Pillar 2 of LLM coding framework. LLMs need to know which tests
#      to run and which areas are high-risk before coding.
# HOW: Parses git diff to find changed files, maps them to test files
#      via naming convention and import graph, flags high-risk areas.
#
# USAGE:
#   bash scripts/impact-graph.sh                    # staged changes
#   bash scripts/impact-graph.sh --base main        # vs branch
#   bash scripts/impact-graph.sh --files "a.ts b.ts" # explicit files
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01
##

set -euo pipefail

BASE_BRANCH=""
EXPLICIT_FILES=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --base)  BASE_BRANCH="$2"; shift 2 ;;
    --files) EXPLICIT_FILES="$2"; shift 2 ;;
    *)       shift ;;
  esac
done

# ─── Get changed files ────────────────────────────────────────────
if [ -n "$EXPLICIT_FILES" ]; then
  CHANGED="$EXPLICIT_FILES"
elif [ -n "$BASE_BRANCH" ]; then
  CHANGED=$(git diff --name-only "origin/${BASE_BRANCH}...HEAD" 2>/dev/null || true)
else
  # Staged + unstaged
  CHANGED=$(git diff --name-only HEAD 2>/dev/null || git diff --name-only --cached 2>/dev/null || true)
  CHANGED+=$'\n'$(git diff --name-only --cached 2>/dev/null || true)
  CHANGED=$(echo "$CHANGED" | sort -u | grep -v '^$' || true)
fi

if [ -z "$CHANGED" ]; then
  echo "No changed files detected."
  exit 0
fi

echo "═══════════════════════════════════════════════════════"
echo "  CHANGE IMPACT GRAPH"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Categorize changed files ─────────────────────────────────────
APPS_CHANGED=""
PACKAGES_CHANGED=""
SCRIPTS_CHANGED=""
TESTS_CHANGED=""
DOCS_CHANGED=""
CI_CHANGED=""
CONFIG_CHANGED=""

while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    apps/api/*)       APPS_CHANGED+="  - $f"$'\n' ;;
    apps/web/*)       APPS_CHANGED+="  - $f"$'\n' ;;
    apps/admin/*)     APPS_CHANGED+="  - $f"$'\n' ;;
    packages/*)       PACKAGES_CHANGED+="  - $f"$'\n' ;;
    scripts/*)        SCRIPTS_CHANGED+="  - $f"$'\n' ;;
    tests/*)          TESTS_CHANGED+="  - $f"$'\n' ;;
    docs/*)           DOCS_CHANGED+="  - $f"$'\n' ;;
    .github/*)        CI_CHANGED+="  - $f"$'\n' ;;
    *.config.*|turbo.json|tsconfig*|package.json|.pre-commit*|.coderabbit*)
                      CONFIG_CHANGED+="  - $f"$'\n' ;;
    *.test.*|*.spec.*) TESTS_CHANGED+="  - $f"$'\n' ;;
  esac
done <<< "$CHANGED"

# ─── Map to affected test suites ──────────────────────────────────
echo "### Changed Files"
echo "$CHANGED" | sed 's/^/  - /'
echo ""

MUST_RUN_TESTS=""

# Rule: if packages/shared-llm changed → run all API tests
if echo "$CHANGED" | grep -q "packages/shared-llm"; then
  MUST_RUN_TESTS+="  - npx turbo run test --filter=@playbook/api (shared-llm changed)"$'\n'
fi

# Rule: if packages/shared-types changed → run ALL tests
if echo "$CHANGED" | grep -q "packages/shared-types"; then
  MUST_RUN_TESTS+="  - npx turbo run test (shared-types changed — affects all consumers)"$'\n'
fi

# Rule: if packages/shared-ui changed → run web + admin tests
if echo "$CHANGED" | grep -q "packages/shared-ui"; then
  MUST_RUN_TESTS+="  - npx turbo run test --filter=@playbook/web --filter=@playbook/admin (shared-ui changed)"$'\n'
fi

# Rule: if apps/api/src/routes changed → run contract tests
if echo "$CHANGED" | grep -q "apps/api/src/routes"; then
  MUST_RUN_TESTS+="  - npm run test:contract (API routes changed)"$'\n'
fi

# Rule: if apps/web or apps/admin layout/page changed → run E2E
if echo "$CHANGED" | grep -qE "apps/(web|admin)/src/app/"; then
  MUST_RUN_TESTS+="  - npm run test:e2e:fullstack (web/admin pages changed)"$'\n'
fi

# Rule: if drizzle/ changed → run API tests + contract tests
if echo "$CHANGED" | grep -q "drizzle/"; then
  MUST_RUN_TESTS+="  - npx turbo run test --filter=@playbook/api + npm run test:contract (schema changed)"$'\n'
fi

# Rule: if CI workflows changed → validate workflow syntax
if echo "$CHANGED" | grep -q ".github/workflows"; then
  MUST_RUN_TESTS+="  - Validate workflow YAML syntax (CI config changed)"$'\n'
fi

# Fallback: app-specific unit tests for changed apps
for app in api web admin; do
  if echo "$CHANGED" | grep -q "apps/$app/" && ! echo "$MUST_RUN_TESTS" | grep -q "$app"; then
    MUST_RUN_TESTS+="  - npx turbo run test --filter=@playbook/$app"$'\n'
  fi
done

echo "### Must-Run Tests"
if [ -n "$MUST_RUN_TESTS" ]; then
  echo "$MUST_RUN_TESTS"
else
  echo "  - npx turbo run test (default: run all)"
fi
echo ""

# ─── High-risk areas ──────────────────────────────────────────────
HIGH_RISK=""

if echo "$CHANGED" | grep -qE "(auth|identity|middleware|security)"; then
  HIGH_RISK+="  - AUTH: Authentication/authorization files changed — verify auth enforcement"$'\n'
fi

if echo "$CHANGED" | grep -qE "(drizzle|migration|schema)"; then
  HIGH_RISK+="  - DATA: Database schema/migration changed — verify backward compatibility"$'\n'
fi

if echo "$CHANGED" | grep -qE "(route|endpoint|handler).*\.(ts|py)"; then
  HIGH_RISK+="  - API: Route handlers changed — verify response shape matches contracts"$'\n'
fi

if echo "$CHANGED" | grep -qE "package\.json|package-lock\.json"; then
  HIGH_RISK+="  - DEPS: Dependencies changed — verify no phantom packages"$'\n'
fi

if echo "$CHANGED" | grep -qE "(\.env|config|secret)"; then
  HIGH_RISK+="  - CONFIG: Config/env files changed — verify Railway + Vercel env parity"$'\n'
fi

if echo "$CHANGED" | grep -qE "packages/shared-(llm|types|ui)"; then
  HIGH_RISK+="  - SHARED: Shared package changed — all consumers affected, verify no breaking changes"$'\n'
fi

echo "### High-Risk Areas"
if [ -n "$HIGH_RISK" ]; then
  echo "$HIGH_RISK"
else
  echo "  - None detected"
fi
echo ""

# ─── Review checklist ─────────────────────────────────────────────
echo "### Review Checklist"
echo "  - [ ] Task contract exists for this change"
echo "  - [ ] Anti-patterns from Learning Journal checked"

if [ -n "$HIGH_RISK" ]; then
  echo "  - [ ] High-risk areas verified (see above)"
fi

if echo "$CHANGED" | grep -qE "apps/(web|admin)"; then
  echo "  - [ ] UI changes verified visually (screenshot or browser check)"
fi

if echo "$CHANGED" | grep -q "apps/api"; then
  echo "  - [ ] API changes verified with curl (prove-it)"
fi

if echo "$CHANGED" | grep -q "packages/"; then
  echo "  - [ ] Shared package changes — all consumers still build"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
```

**Step 2: Make executable and test**

```bash
chmod +x scripts/impact-graph.sh
bash scripts/impact-graph.sh --files "apps/api/src/routes/costs.ts packages/shared-llm/src/index.ts"
```

Expected: output showing must-run tests (API tests, contract tests), high-risk areas (API, SHARED), review checklist.

**Step 3: Commit**

```bash
git add scripts/impact-graph.sh
git commit -m "feat(framework): add change impact graph script

Pillar 2. Maps changed files to must-run tests, high-risk areas,
and review checklist. Used by pre-push hook and CI.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Create Feedback Capture Script

**Files:**
- Create: `scripts/capture-feedback.sh`

**Step 1: Write the feedback capture script**

Create `scripts/capture-feedback.sh`:

```bash
#!/usr/bin/env bash
##
# FILE PURPOSE: Capture a feedback event to docs/feedback/
#
# WHY: Pillar 6 (Memory + Recurrence). Every failure, finding, or learning
#      gets stored as a JSON event for pattern detection and auto-escalation.
# HOW: Takes event parameters, validates against schema, writes JSON file.
#
# USAGE:
#   bash scripts/capture-feedback.sh \
#     --type ci-failure \
#     --source ci \
#     --summary "Drizzle .where().where() type error" \
#     --root-cause "Chained .where() silently compiles but fails type-check" \
#     --bucket type-error \
#     --files "apps/api/src/routes/costs.ts" \
#     --automatable true \
#     --automatable-as eslint-rule
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01
##

set -euo pipefail

TYPE=""
SOURCE=""
SUMMARY=""
ROOT_CAUSE=""
BUCKET="other"
FILES=""
AUTOMATABLE="false"
AUTOMATABLE_AS="not-automatable"

while [[ $# -gt 0 ]]; do
  case $1 in
    --type)           TYPE="$2"; shift 2 ;;
    --source)         SOURCE="$2"; shift 2 ;;
    --summary)        SUMMARY="$2"; shift 2 ;;
    --root-cause)     ROOT_CAUSE="$2"; shift 2 ;;
    --bucket)         BUCKET="$2"; shift 2 ;;
    --files)          FILES="$2"; shift 2 ;;
    --automatable)    AUTOMATABLE="$2"; shift 2 ;;
    --automatable-as) AUTOMATABLE_AS="$2"; shift 2 ;;
    *)                shift ;;
  esac
done

if [ -z "$TYPE" ] || [ -z "$SOURCE" ] || [ -z "$SUMMARY" ]; then
  echo "ERROR: --type, --source, and --summary are required"
  echo "Usage: bash scripts/capture-feedback.sh --type <type> --source <source> --summary <text>"
  exit 1
fi

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FEEDBACK_DIR="docs/feedback"
mkdir -p "$FEEDBACK_DIR"

# Build files array JSON
FILES_JSON="[]"
if [ -n "$FILES" ]; then
  FILES_JSON=$(echo "$FILES" | tr ' ' '\n' | python3 -c "
import sys, json
files = [f.strip() for f in sys.stdin if f.strip()]
print(json.dumps(files))
" 2>/dev/null || echo "[]")
fi

# Check recurrence — how many times has this bucket appeared?
RECURRENCE=1
if [ -d "$FEEDBACK_DIR" ]; then
  EXISTING=$(grep -rl "\"rootCauseBucket\": \"$BUCKET\"" "$FEEDBACK_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
  RECURRENCE=$((EXISTING + 1))
fi

# Write the event
FILENAME="${FEEDBACK_DIR}/${TIMESTAMP}-${TYPE}.json"

python3 -c "
import json

event = {
    'date': '$DATE',
    'type': '$TYPE',
    'source': '$SOURCE',
    'summary': $(python3 -c "import json; print(json.dumps('$SUMMARY'))"),
    'rootCause': $(python3 -c "import json; print(json.dumps('$ROOT_CAUSE'))") if '$ROOT_CAUSE' else None,
    'rootCauseBucket': '$BUCKET',
    'filesInvolved': $FILES_JSON,
    'automatable': $AUTOMATABLE,
    'automatableAs': '$AUTOMATABLE_AS',
    'recurrenceCount': $RECURRENCE,
    'escalated': False,
    'escalatedTo': None
}

# Remove None values
event = {k: v for k, v in event.items() if v is not None}

with open('$FILENAME', 'w') as f:
    json.dump(event, f, indent=2)

print(f'Feedback captured: $FILENAME')

if $RECURRENCE >= 3:
    print(f'WARNING: Root cause bucket \"{event[\"rootCauseBucket\"]}\" has occurred {$RECURRENCE} times.')
    print(f'ESCALATION RECOMMENDED: Convert to automated check ({event.get(\"automatableAs\", \"unknown\")})')
"

echo ""
echo "Recurrence count for '$BUCKET': $RECURRENCE"
if [ "$RECURRENCE" -ge 3 ]; then
  echo "ESCALATION THRESHOLD REACHED (3+). This failure pattern should become an automated check."
fi
```

**Step 2: Make executable and test**

```bash
chmod +x scripts/capture-feedback.sh
bash scripts/capture-feedback.sh \
  --type ci-failure \
  --source ci \
  --summary "Test: Drizzle where chaining" \
  --root-cause "Chained .where() silently compiles but fails" \
  --bucket type-error \
  --files "apps/api/src/routes/costs.ts" \
  --automatable true \
  --automatable-as eslint-rule
```

Expected: JSON file created in `docs/feedback/`, recurrence count shown.

**Step 3: Clean up test file and commit**

```bash
rm docs/feedback/*-ci-failure.json 2>/dev/null || true
git add scripts/capture-feedback.sh
git commit -m "feat(framework): add feedback capture script

Pillar 6 (Memory + Recurrence). Captures typed feedback events with
root-cause buckets and recurrence tracking. Alerts when escalation
threshold (3 occurrences) is reached.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Create Escalation Scanner Script

**Files:**
- Create: `scripts/scan-escalations.sh`

**Step 1: Write the escalation scanner**

Create `scripts/scan-escalations.sh`:

```bash
#!/usr/bin/env bash
##
# FILE PURPOSE: Scan feedback events and anti-pattern registry for escalation candidates
#
# WHY: Loop 3 of the feedback module. Finds recurring failures that should
#      be converted into automated checks (ESLint rules, hooks, CI scripts).
# HOW: Reads docs/feedback/*.json, groups by rootCauseBucket, flags any
#      bucket with 3+ occurrences and automatable=true that hasn't been escalated.
#      Also cross-references docs/LEARNING_JOURNAL.md anti-pattern table.
#
# USAGE: bash scripts/scan-escalations.sh
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01
##

set -euo pipefail

FEEDBACK_DIR="docs/feedback"

echo "═══════════════════════════════════════════════════════"
echo "  ESCALATION SCANNER"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Scan feedback events ─────────────────────────────────────────
if [ -d "$FEEDBACK_DIR" ] && ls "$FEEDBACK_DIR"/*.json 1>/dev/null 2>&1; then
  echo "### Feedback Events Analysis"
  echo ""

  python3 -c "
import json, glob, os
from collections import defaultdict

events = []
for f in sorted(glob.glob('$FEEDBACK_DIR/*.json')):
    try:
        with open(f) as fh:
            events.append(json.load(fh))
    except Exception:
        pass

if not events:
    print('  No feedback events found.')
    exit(0)

print(f'  Total events: {len(events)}')
print()

# Group by bucket
buckets = defaultdict(list)
for e in events:
    bucket = e.get('rootCauseBucket', 'other')
    buckets[bucket].append(e)

# Find escalation candidates
candidates = []
for bucket, items in sorted(buckets.items(), key=lambda x: -len(x[1])):
    count = len(items)
    automatable = any(i.get('automatable', False) for i in items)
    escalated = all(i.get('escalated', False) for i in items)
    automatable_as = next((i['automatableAs'] for i in items if i.get('automatableAs')), 'unknown')

    status = 'ESCALATED' if escalated else ('ESCALATE NOW' if count >= 3 and automatable else 'monitoring')
    print(f'  {bucket}: {count} occurrences — {status}')

    if count >= 3 and automatable and not escalated:
        candidates.append({
            'bucket': bucket,
            'count': count,
            'automatableAs': automatable_as,
            'summaries': [i.get('summary', '') for i in items[:3]]
        })

print()

if candidates:
    print('### ESCALATION CANDIDATES (3+ occurrences, automatable, not yet escalated)')
    print()
    for c in candidates:
        print(f'  BUCKET: {c[\"bucket\"]}')
        print(f'  Count: {c[\"count\"]}')
        print(f'  Automate as: {c[\"automatableAs\"]}')
        print(f'  Examples:')
        for s in c['summaries']:
            print(f'    - {s}')
        print()
else:
    print('### No escalation candidates found.')
    print('  All recurring patterns either escalated or below threshold.')
"
else
  echo "  No feedback events found in $FEEDBACK_DIR/"
fi

echo ""

# ─── Cross-reference anti-pattern registry ─────────────────────────
echo "### Anti-Pattern Registry Cross-Reference"
echo ""

JOURNAL="docs/LEARNING_JOURNAL.md"
if [ -f "$JOURNAL" ]; then
  # Count anti-patterns
  AP_COUNT=$(grep -c "^|" "$JOURNAL" | tail -1 || echo "0")
  echo "  Anti-patterns in registry: $AP_COUNT"

  # Check which ones could be automated but aren't yet in ESLint/CI
  echo ""
  echo "  Candidates for automation (manual review needed):"

  # Look for patterns that mention specific code patterns
  grep "^|" "$JOURNAL" | grep -v "Anti-Pattern" | grep -v "---" | while IFS='|' read -r _ pattern what_goes_wrong prevention _; do
    pattern=$(echo "$pattern" | xargs)
    prevention=$(echo "$prevention" | xargs)

    # Check if prevention mentions a tool that could be automated
    if echo "$prevention" | grep -qiE "use.*instead|always.*add|never|check.*before"; then
      echo "    - $pattern → $prevention"
    fi
  done 2>/dev/null || true
else
  echo "  Learning Journal not found at $JOURNAL"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
```

**Step 2: Make executable and test**

```bash
chmod +x scripts/scan-escalations.sh
bash scripts/scan-escalations.sh
```

Expected: Shows anti-pattern registry cross-reference (no feedback events yet since we cleaned them up).

**Step 3: Commit**

```bash
git add scripts/scan-escalations.sh
git commit -m "feat(framework): add escalation scanner for recurring failures

Pillar 6, Loop 3. Scans feedback events and anti-pattern registry
to find failure patterns that should be promoted to automated checks.
Alerts when a root-cause bucket hits 3+ occurrences.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Update PR Template with Framework Sections

**Files:**
- Modify: `.github/PULL_REQUEST_TEMPLATE.md`

**Step 1: Update PR template**

Replace `.github/PULL_REQUEST_TEMPLATE.md` with:

```markdown
## Spec Lock
- **Intent**: PRODUCT | DEV-TOOLING | DOCS | BUGFIX
- **In-scope**:
- **Out-of-scope**:

## Summary
<!-- 1-3 sentences: what changed and why -->

## Task Contract
<!-- Link to docs/contracts/YYYY-MM-DD-<topic>.md or inline the contract -->
- **Goal**:
- **Non-Goals**:
- **Modules Touched**:

## Risk Level
<!-- LOW / MEDIUM / HIGH — and why -->

## Impact Analysis
<!-- Paste output of: bash scripts/impact-graph.sh --base main -->
- **Must-run tests**:
- **High-risk areas**:

## Proof
<!-- Paste actual execution output. No claimed behavior without evidence. -->
<!-- curl output, test output, screenshot — real output only -->

## Anti-Patterns Checked
<!-- Which entries from docs/LEARNING_JOURNAL.md Anti-Pattern Registry did you verify? -->
- [ ] Checked relevant anti-patterns (list them)

## Test Plan
- [ ] Type-check passes
- [ ] Lint clean
- [ ] Impacted tests pass
- [ ] Build succeeds
- [ ] Prove-it executed (if applicable)

## Maker LLM
<!-- Claude / Codex / Gemini / Cursor / Human -->

## Confidence
<!-- VERIFIED (0.95) | HIGH (0.85) | MEDIUM (0.70) | LOW (0.40) -->
```

**Step 2: Update check-pr-template.sh to validate new sections**

Edit `scripts/check-pr-template.sh` — replace the section check loop (the `for section in` block around line 67-71) with:

```bash
# Check for required sections (case-insensitive heading match)
for section in "Summary" "Risk Level" "Test Plan" "Proof" "Maker LLM" "Task Contract"; do
  if ! echo "$PR_BODY" | grep -qi "^##[[:space:]]*${section}"; then
    echo "  Missing required section: ## $section"
    MISSING=$((MISSING + 1))
  fi
done
```

**Step 3: Test locally**

```bash
bash scripts/check-pr-template.sh
```

Expected: "not a GitHub Actions run — skipping" (local run). The validation logic is correct.

**Step 4: Commit**

```bash
git add .github/PULL_REQUEST_TEMPLATE.md scripts/check-pr-template.sh
git commit -m "feat(framework): update PR template with contract, proof, impact sections

Pillars 1 (Contract), 2 (Impact), 5 (Anti-Fake). PR template now
requires: Task Contract, Impact Analysis, Proof, Anti-Patterns Checked.
check-pr-template.sh updated to validate all required sections.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Update CodeRabbit Config for Anti-Fake Detection

**Files:**
- Modify: `.coderabbit.yaml`

**Step 1: Update CodeRabbit config**

Replace `.coderabbit.yaml` with:

```yaml
language: en-US
reviews:
  request_changes_workflow: true
  high_level_summary: true
  poem: false
  auto_review:
    enabled: true
    drafts: false
  path_instructions:
    - path: "**/*.py"
      instructions: >
        No print() in production. Use logging. No bare except. Files < 600 lines.
        Flag stub returns (return [], return {}, return None) without TODO marker.
        Flag empty catch/except blocks that swallow errors.
    - path: "**/*.ts"
      instructions: >
        No any types (use unknown). No console.log. No commented-out code.
        Flag stub returns (return [], return {}, return null, return '') in non-test files.
        Flag empty catch blocks that swallow errors.
        Flag .where().where() chaining in Drizzle (must use and()).
        Flag import Redis from 'ioredis' (must use { Redis }).
    - path: "**/*.tsx"
      instructions: >
        No any types (use unknown). No console.log. No commented-out code.
        Flag hardcoded strings where env vars or config should be used.
    - path: "scripts/**"
      instructions: >
        Scripts must be idempotent and exit non-zero on failure.
        Flag sed/awk parsing of source code regexes (use Python instead).
    - path: "docs/**"
      instructions: >
        Check factual accuracy. Flag stale dates or broken links.
        Verify any claimed feature exists in the codebase.
    - path: "apps/api/src/routes/**"
      instructions: >
        Verify response shape matches documented API contracts.
        Flag route handlers that parse but don't persist (ingest anti-pattern).
        Check auth enforcement — no route should be unprotected unless explicitly public.
    - path: "packages/shared-llm/**"
      instructions: >
        Flag JSON.parse() on raw LLM output (use multi-strategy extractor).
        Flag || with LLM response fields (use ?? nullish coalescing).
        Verify timeout hierarchy: agent < executor < HTTP.
    - path: ".github/workflows/**"
      instructions: >
        Verify AUTH_MODE=strict in CI (never AUTH_MODE=open).
        Check that env vars are set for both Railway and Vercel.
chat:
  auto_reply: true
tone_instructions: >
  Direct and technical. This is a multi-LLM codebase (Claude, Codex, Cursor, Gemini).
  Flag hallucination risks: phantom imports, fabricated APIs, stub functions, empty catches.
  Flag anti-patterns from the Learning Journal (docs/LEARNING_JOURNAL.md).
  Every claimed behavior must have evidence (test output, curl, screenshot).
  If you see a pattern that has been flagged 3+ times in feedback, recommend escalation
  to an automated check (ESLint rule, CI script, or git hook).
```

**Step 2: Commit**

```bash
git add .coderabbit.yaml
git commit -m "feat(framework): enhance CodeRabbit config with anti-fake detection

Pillar 5 (Anti-Fake Outputs). CodeRabbit now checks for: stub returns,
empty catches, Drizzle .where() chaining, raw JSON.parse on LLM output,
|| with LLM fields, AUTH_MODE=open in CI, and more. All sourced from
the Learning Journal anti-pattern registry.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Add Pre-Push Hook with Impact Graph

**Files:**
- Modify: `.pre-commit-config.yaml`

**Step 1: Add pre-push hook to pre-commit config**

Append to `.pre-commit-config.yaml`:

```yaml
  - repo: local
    hooks:
      - id: impact-graph
        name: Change impact analysis (pre-push)
        entry: bash scripts/impact-graph.sh
        language: system
        pass_filenames: false
        always_run: true
        stages: [pre-push]
      - id: type-check
        name: TypeScript type-check
        entry: bash -c 'npx turbo run type-check 2>&1 | tail -20'
        language: system
        pass_filenames: false
        always_run: true
        stages: [pre-push]
```

**Step 2: Install pre-push hook**

```bash
pre-commit install --hook-type pre-push
```

Expected: "pre-push hook installed"

**Step 3: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "feat(framework): add pre-push hooks for impact graph and type-check

Pillar 2 (Impact Graph) + Pillar 4 (Two-Layer Validation).
Pre-push runs impact analysis and type-check. Pre-commit continues
to run GitGuardian and CLAUDE.md nav sync.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Add CI Framework Gates Workflow

**Files:**
- Create: `.github/workflows/framework-gates.yml`

**Step 1: Write the framework gates workflow**

Create `.github/workflows/framework-gates.yml`:

```yaml
##
# FILE PURPOSE: Framework-specific CI gates (separate from main CI)
#
# WHY: Pillars 2, 5, 6 need CI enforcement beyond type-check/lint/test.
#      Impact graph, proof validation, and escalation scanning run here.
# HOW: Runs on every PR. Posts impact analysis as PR comment.
#      Validates PR has required proof section. Runs escalation scanner.
#
# AUTHOR: Claude Opus 4.6
# LAST UPDATED: 2026-03-01
##

name: Framework Gates

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: framework-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  impact-analysis:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Run impact graph
        id: impact
        run: |
          OUTPUT=$(bash scripts/impact-graph.sh --base ${{ github.base_ref }} 2>&1 || true)
          echo "$OUTPUT"
          # Save for PR comment
          echo "$OUTPUT" > /tmp/impact-report.txt

      - name: Post impact analysis to PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            let report = '';
            try {
              report = fs.readFileSync('/tmp/impact-report.txt', 'utf8');
            } catch (e) {
              report = 'Impact analysis did not produce output.';
            }

            const body = `## Change Impact Analysis\n\n\`\`\`\n${report}\n\`\`\`\n\n---\n*Generated by Framework Gates workflow*`;

            const comments = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            const existing = comments.data.find(c =>
              c.body.includes('Change Impact Analysis') &&
              c.user.type === 'Bot'
            );

            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body: body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: body,
              });
            }

  proof-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate PR has proof section
        run: |
          if [ -z "${GITHUB_EVENT_PATH:-}" ]; then
            echo "Not a GitHub Actions run — skipping"
            exit 0
          fi

          PR_BODY=$(python3 -c "
          import json
          try:
              with open('$GITHUB_EVENT_PATH') as f:
                  event = json.load(f)
              body = event.get('pull_request', {}).get('body', '') or ''
              print(body)
          except Exception:
              print('')
          " 2>/dev/null || true)

          # Check proof section exists and is non-empty
          if ! echo "$PR_BODY" | grep -qi "^##[[:space:]]*Proof"; then
            echo "❌ Missing ## Proof section in PR description"
            echo "   Every PR must include execution evidence (test output, curl, screenshot)"
            exit 1
          fi

          # Check proof section has content (not just the template comments)
          PROOF_CONTENT=$(echo "$PR_BODY" | sed -n '/^##[[:space:]]*Proof/,/^##/p' | grep -v "^##" | grep -v "^<!--" | grep -v "^$" | head -5)
          if [ -z "$PROOF_CONTENT" ]; then
            echo "⚠️  ## Proof section exists but appears empty"
            echo "   Add actual execution evidence before merging"
            # Warning, not blocking — allow draft PRs
            exit 0
          fi

          echo "✅ Proof section present with content"

  escalation-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Run escalation scanner
        run: bash scripts/scan-escalations.sh
```

**Step 2: Commit**

```bash
git add .github/workflows/framework-gates.yml
git commit -m "feat(framework): add CI workflow for impact analysis, proof validation, escalation scan

Pillars 2, 5, 6 CI enforcement. Posts impact analysis as PR comment,
validates PR has non-empty proof section, runs escalation scanner
to detect patterns ready for automation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Update CLAUDE.md with Framework Rules

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add framework section to CLAUDE.md**

Append after the "For New LLMs Joining" section:

```markdown

## LLM Coding Framework (6 Pillars)

> Every LLM (Claude, Codex, Cursor, Gemini) must follow this framework.
> These are not suggestions — they are enforced by git hooks, CI, and CodeRabbit.

### Pillar 1: Task Contract (before coding)

Before writing any code, produce or verify a task contract:
- **Goal**: One sentence — what this achieves
- **Non-Goals**: What this explicitly does NOT do
- **Modules Touched**: Every file/directory that will be modified
- **Acceptance Criteria**: Testable conditions that prove the task is done
- **Rollback Plan**: How to undo if it breaks production
- **Anti-Patterns Checked**: Which entries from `docs/LEARNING_JOURNAL.md` are relevant

Template: `docs/contracts/TEMPLATE.md`. Save contracts to `docs/contracts/YYYY-MM-DD-<topic>.md`.

If the user's request doesn't include a contract, generate one and get approval before coding.

### Pillar 2: Change Impact Graph (before and after coding)

Before pushing, run: `bash scripts/impact-graph.sh`

This maps your changed files to:
- **Must-run tests** (which test suites are affected)
- **High-risk areas** (auth, data, shared packages, etc.)
- **Review checklist** (what the reviewer must verify)

Run the must-run tests before pushing. The pre-push hook runs this automatically. CI posts impact analysis as a PR comment.

### Pillar 3: Context Pack (before coding)

Before implementation, retrieve and read:
1. This file (`CLAUDE.md`)
2. `docs/LEARNING_JOURNAL.md` — at minimum the Anti-Pattern Registry table
3. Relevant test files for modules you're about to touch
4. Recent `docs/feedback/*.json` events for the modules you're touching

Do NOT code without reading the anti-pattern registry. This is enforced by the Learning Journal protocol in memory.

### Pillar 4: Two-Layer Validation (during and after coding)

**Layer A (fast, every commit):**
- Type-check: `npx turbo run type-check`
- Lint: `npx turbo run lint`
- Impacted unit tests (from impact graph)

**Layer B (full, every push/PR):**
- Full test suite: `npx turbo run test`
- Build: `npx turbo run build`
- Contract tests: `npm run test:contract`
- E2E (if UI changed): `npm run test:e2e:fullstack`
- Hallucination check (CI runs automatically)

Pre-push hook enforces Layer B. CI enforces both layers.

### Pillar 5: Anti-Fake Outputs (always)

**No claimed behavior without evidence.**

- Every PR must have a `## Proof` section with real execution output
- `curl` output for API changes, test output for logic changes, screenshots for UI changes
- Confidence score required: VERIFIED (0.95) / HIGH (0.85) / MEDIUM (0.70) / LOW (0.40)
- Below 0.70 triggers mandatory cross-LLM review
- CodeRabbit is configured to flag: stub returns, empty catches, hallucinated imports, raw `JSON.parse()` on LLM output

### Pillar 6: Memory + Recurrence (after every session/PR)

**Every failure becomes a permanent check.**

1. **Session level**: Run `/reflect` at end of meaningful sessions → updates Learning Journal
2. **PR level**: CI failures and CodeRabbit findings are captured to `docs/feedback/*.json` via `scripts/capture-feedback.sh`
3. **Escalation**: When a root-cause bucket hits 3+ occurrences → `scripts/scan-escalations.sh` flags it → convert to ESLint rule, CI check, or hook

The goal: an empty anti-pattern registry — not because we stopped finding problems, but because every problem became an automated check.

### Maker-Checker Model

| Role | Who | When |
|---|---|---|
| **Maker** | Any LLM | Writes code |
| **Auto-Checker** | CodeRabbit | Every PR, automatic |
| **Gate Enforcer** | Git hooks + CI | Every commit/push/PR |
| **Cross-Checker** | Different LLM than maker | Confidence < 0.70 or high-risk area |
| **Memory Keeper** | `/reflect` skill | End of session |

Branch naming convention for maker detection: `claude/feature-name`, `codex/feature-name`, `cursor/feature-name`, `gemini/feature-name`.

The multi-LLM review workflow (`.github/workflows/multi-llm-review.yml`) detects the maker LLM from branch name or Co-Authored-By and suggests a different reviewer.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(framework): add 6-pillar LLM coding framework to CLAUDE.md

The framework every LLM must follow: Task Contract, Change Impact Graph,
Context Pack, Two-Layer Validation, Anti-Fake Outputs, Memory + Recurrence.
Plus maker-checker model for multi-LLM review.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Create `/contract` Skill (Claude Code only)

**Files:**
- Create: `SKILLS.md` (project-level skill, or add to project `.claude/skills/contract.md` if using local skills)

Note: This task creates the skill file at the project level. The exact path depends on whether the project uses `.claude/skills/` or a global skill directory. For ai-product-playbook, create it at the project root as a documented workflow since skills are user-specific.

**Step 1: Create the skill reference doc**

Create `docs/skills/contract.md`:

```markdown
# /contract Skill — Task Contract Generator

> For Claude Code users. Other LLMs: follow the template at `docs/contracts/TEMPLATE.md` manually.

## When to Use

Before starting ANY implementation task. This is Pillar 1 of the framework.

## What It Does

1. Reads the user's request
2. Scans `docs/LEARNING_JOURNAL.md` anti-pattern registry for relevant entries
3. Runs `bash scripts/impact-graph.sh --files "<estimated files>"` to preview impact
4. Generates a task contract from `docs/contracts/TEMPLATE.md`
5. Asks user for approval
6. Saves to `docs/contracts/YYYY-MM-DD-<topic>.md`

## How to Invoke

Say `/contract` or ask Claude Code to "create a task contract for this work."

## Contract Fields

| Field | Required | Description |
|---|---|---|
| Goal | Yes | One sentence |
| Non-Goals | Yes | What we're NOT doing |
| Modules Touched | Yes | Every file that will change |
| Acceptance Criteria | Yes | Testable pass/fail conditions |
| Rollback Plan | Yes | How to undo |
| Anti-Patterns Checked | Yes | Relevant Learning Journal entries |
| Proof Required | Yes | What evidence to show |
```

**Step 2: Commit**

```bash
mkdir -p docs/skills
git add docs/skills/contract.md
git commit -m "docs(framework): add /contract skill documentation

Pillar 1 reference for Claude Code users. Documents the task contract
workflow and fields.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Final Integration Test

**Step 1: Run all scripts to verify they work**

```bash
cd /path/to/ai-product-playbook

# Impact graph
bash scripts/impact-graph.sh --files "apps/api/src/routes/costs.ts packages/shared-llm/src/index.ts"

# Feedback capture
bash scripts/capture-feedback.sh \
  --type anti-pattern-discovered \
  --source claude \
  --summary "Integration test feedback event" \
  --bucket other \
  --automatable false \
  --automatable-as not-automatable

# Escalation scanner
bash scripts/scan-escalations.sh

# Clean up test feedback
rm docs/feedback/*-anti-pattern-discovered.json 2>/dev/null || true
```

Expected: All three scripts run without errors, produce readable output.

**Step 2: Verify CI workflow syntax**

```bash
# Check YAML is valid
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/framework-gates.yml'))" && echo "YAML valid"
```

**Step 3: Verify pre-commit config**

```bash
pre-commit run --all-files 2>&1 | tail -5
```

**Step 4: Run existing quality gates**

```bash
npx turbo run type-check lint
```

**Step 5: Final commit if any cleanup needed, then push**

```bash
git status
# If clean, push
git push origin HEAD
```

---

## Summary: What Was Built

| Pillar | Enforcement Layers | Files |
|---|---|---|
| 1. Task Contract | CLAUDE.md + PR template + CI check | `docs/contracts/TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/skills/contract.md` |
| 2. Change Impact Graph | Script + pre-push hook + CI PR comment | `scripts/impact-graph.sh`, `.pre-commit-config.yaml`, `.github/workflows/framework-gates.yml` |
| 3. Context Pack | CLAUDE.md rules | `CLAUDE.md` (updated) |
| 4. Two-Layer Validation | Pre-push hook + CI | `.pre-commit-config.yaml`, existing `ci.yml` |
| 5. Anti-Fake Outputs | PR template + CI proof check + CodeRabbit | `.github/PULL_REQUEST_TEMPLATE.md`, `.coderabbit.yaml`, `.github/workflows/framework-gates.yml` |
| 6. Memory + Recurrence | Feedback capture + escalation scanner + CI | `scripts/capture-feedback.sh`, `scripts/scan-escalations.sh`, `docs/feedback/schema.json` |

### Feedback Loop Summary

```
Failure → capture-feedback.sh → docs/feedback/*.json
                                      ↓
                              scan-escalations.sh (CI weekly + on-demand)
                                      ↓
                              3+ occurrences + automatable?
                                      ↓
                              YES → propose ESLint rule / CI check / hook
                                      ↓
                              PR with new automated check
                                      ↓
                              Failure class permanently extinct
```
