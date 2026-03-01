#!/bin/bash
# Production Release Guard
#
# WHY: Prevents accidental production deploys from wrong directory or dirty state.
# HOW: Verifies repo context, branch, remote, and git cleanliness.
#
# USAGE: bash scripts/prod_release_guard.sh
#
# AUTHOR: Adapted from job-matchmaker
# LAST UPDATED: 2026-02-28

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

fail() {
    echo "ERROR: $1" >&2
    exit 1
}

echo "=== Production Release Guard ==="
echo ""

# Verify git repo
top_level="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$top_level" ] || fail "Not inside a git repository."
[ "$top_level" = "$REPO_ROOT" ] || fail "Script must run from the repo root."

# Verify remote exists
origin_url="$(git remote get-url origin 2>/dev/null || true)"
[ -n "$origin_url" ] || fail "Git remote 'origin' is not configured."

# Verify on main branch
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || fail "Production releases must run from 'main' (current: $branch)."

# Check for uncommitted changes (skip in CI — build artifacts are expected)
if [ -z "${CI:-}" ]; then
    if ! git diff --quiet || ! git diff --cached --quiet; then
        fail "Tracked changes are present. Commit/stash before releasing to production."
    fi
fi

# Check for untracked files (warning only)
untracked="$(git ls-files --others --exclude-standard | grep -v '^\.' || true)"
if [ -n "$untracked" ]; then
    echo "WARNING: Untracked files detected (review before push):"
    echo "$untracked" | head -10
    echo ""
fi

# Sync with remote
git fetch origin main --quiet || echo "WARNING: Could not refresh origin/main (network issue)."

head_sha="$(git rev-parse --short HEAD)"
origin_main_sha="$(git rev-parse --short origin/main 2>/dev/null || echo 'unknown')"
ahead_behind="$(git rev-list --left-right --count origin/main...HEAD 2>/dev/null || echo '0 0')"
behind_count="$(echo "$ahead_behind" | awk '{print $1}')"
ahead_count="$(echo "$ahead_behind" | awk '{print $2}')"

echo "Branch:      $branch"
echo "HEAD:        $head_sha"
echo "origin/main: $origin_main_sha"
echo "Ahead/Behind: +$ahead_count / -$behind_count"
echo ""

if [ "$behind_count" != "0" ]; then
    fail "Local main is behind origin/main. Pull/rebase before releasing."
fi

echo "Approved workflow:"
echo "1. Push to GitHub: git push origin main"
echo "2. Let hosting platform auto-deploy from main"
echo "3. Run post-deploy smoke checks"
echo ""
echo "PASS: Release context looks correct."
