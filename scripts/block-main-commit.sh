#!/usr/bin/env bash
# FILE PURPOSE: Pre-commit hook — blocks direct commits to main/master
# WHY: Multiple LLMs share this repo. Branch collisions happen when one session
#      switches the shared working directory to its branch while another commits.
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  echo "ERROR: Direct commits to $branch are blocked."
  echo "Create a feature branch first: git checkout -b claude/<topic>"
  echo "Or use a worktree: git worktree add .claude/worktrees/<name> -b <branch>"
  exit 1
fi
