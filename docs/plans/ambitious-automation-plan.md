# Ambitious Automation Plan: Items 7, 8, 9

> Based on insights analysis of 92 sessions, 102 commits, 189 hours.
> These items build on the quick wins (status skill, post-edit hooks, CLAUDE.md rules) already shipped.

---

## 7. Autonomous Test-Driven Fix Loops

### What It Does
Claude detects a test failure → reads the source → applies a fix → re-runs tests → repeats until green → commits. No human in the loop until the final summary.

### Why It Matters
- 44 buggy-code friction events in 92 sessions — most are sequential fix-rerun cycles
- Average debugging loop: 3-5 iterations before green
- With 1,600+ tests as a safety net, autonomous fixing is viable now

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    /autofix Skill                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. DETECT                                                   │
│     ├── Run full test suite (pytest + npm test)              │
│     ├── Parse failures into structured list:                 │
│     │   { file, test_name, error_type, stack_trace }         │
│     └── Sort by dependency order (utils before features)     │
│                                                              │
│  2. DIAGNOSE (per failure)                                   │
│     ├── Read failing test + source file                      │
│     ├── Classify: missing dep | type error | logic bug |     │
│     │             stale mock | env mismatch                  │
│     └── Generate fix hypothesis                              │
│                                                              │
│  3. FIX                                                      │
│     ├── Apply fix (Edit tool, minimal change)                │
│     ├── Run ONLY the affected test (fast feedback)           │
│     ├── If passes → move to next failure                     │
│     └── If fails → try alt approach (max 3 attempts)         │
│                                                              │
│  4. VERIFY                                                   │
│     ├── Run full test suite (catch regressions)              │
│     ├── Run linter + type checker                            │
│     └── If new failures introduced → revert last fix, retry  │
│                                                              │
│  5. REPORT                                                   │
│     ├── Summary table: file | test fixed | approach taken    │
│     ├── Total: X/Y failures fixed                            │
│     └── If any unfixable: explain why, suggest manual action │
│                                                              │
│  6. COMMIT (only if all tests pass)                          │
│     └── git add + commit with per-fix summary                │
│                                                              │
│  SAFETY RAILS:                                               │
│  ├── Max 3 attempts per failure (no infinite loops)          │
│  ├── Max 20 minutes total runtime                            │
│  ├── Never touch auth, payments, or data deletion code       │
│  ├── Revert on regression (full suite must stay green)       │
│  └── Human approval required for push                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Steps

1. **Create `/autofix` skill** at `.claude/skills/autofix/SKILL.md`
   - Prompt instructs Claude to follow the DETECT → DIAGNOSE → FIX → VERIFY → REPORT → COMMIT loop
   - Includes safety rails as hard constraints in the prompt
   - References project-specific test commands from CLAUDE.md

2. **Create a headless variant** for CI/scheduled runs:
   ```bash
   claude -p "Run /autofix" --allowedTools "Bash,Read,Edit,Grep,Glob" --max-turns 50
   ```

3. **Add to GitHub Actions** as an optional workflow:
   ```yaml
   # .github/workflows/autofix.yml
   on:
     workflow_dispatch:  # Manual trigger only (initially)
     schedule:
       - cron: '0 6 * * 1'  # Monday 6am (weekly)
   ```

4. **Metrics to track**:
   - Fix success rate (% of failures resolved without human help)
   - Average attempts per fix
   - Regression rate (how often a fix breaks something else)
   - Time saved vs. manual debugging

### Prerequisites
- [x] 1,600+ test suite (already exists for job-matchmaker)
- [x] Post-edit type checking hook (just shipped)
- [ ] Headless Claude Code access (available via `claude -p`)
- [ ] GitHub Actions secrets for Claude API

### Estimated Effort
- Skill creation: 1-2 hours
- CI integration: 2-3 hours
- Testing and tuning: 1 week of real-world usage

---

## 8. Parallel Multi-Agent Feature Implementation

### What It Does
A coordinator agent decomposes a feature into independent sub-tasks → spawns parallel agents for backend/frontend/tests/docs → merges results → runs integration tests → single atomic commit.

### Why It Matters
- Most productive sessions already use TaskCreate (143 uses) to parallelize
- Python backend + TypeScript frontend are naturally parallelizable
- Current serial approach: 45-90 min for a full feature
- Parallel approach: estimated 15-30 min (3-4x speedup)

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    /parallel-build Skill                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  PHASE 1: DECOMPOSE (coordinator agent)                          │
│  ├── Read feature spec / user request                            │
│  ├── Analyze codebase for affected files                         │
│  ├── Generate task manifest:                                     │
│  │   ├── Stream A: Backend (API routes + models + schemas)       │
│  │   ├── Stream B: Frontend (pages + components + hooks)         │
│  │   ├── Stream C: Tests (unit + E2E for both A and B)           │
│  │   └── Stream D: Docs (DECISIONS.md, API contracts, types)     │
│  ├── Define interface contracts between streams:                 │
│  │   ├── API request/response types (Stream A → B)               │
│  │   ├── Shared types (Stream D → A, B, C)                       │
│  │   └── Test fixtures (Stream C depends on A, B shapes)         │
│  └── Determine execution order:                                  │
│      ├── D (types/docs) first — defines contracts                │
│      ├── A (backend) + B (frontend) in parallel — use contracts  │
│      └── C (tests) last — needs implementations to test          │
│                                                                   │
│  PHASE 2: EXECUTE (parallel agents via Task tool)                │
│  ├── Agent D: Generate shared types + update docs                │
│  │   └── On completion: signal A + B to start                    │
│  ├── Agent A: Implement backend (uses types from D)              │
│  │   └── Runs own tests: pytest for new endpoints                │
│  ├── Agent B: Implement frontend (uses types from D)             │
│  │   └── Runs own tests: component tests, build check            │
│  └── Agent C: Write integration tests (after A + B complete)     │
│      └── E2E tests covering the full feature flow                │
│                                                                   │
│  PHASE 3: INTEGRATE (coordinator agent)                          │
│  ├── Run /sync-types to verify frontend/backend contract match   │
│  ├── Run full test suite (pytest + npm test + E2E)               │
│  ├── Fix any integration issues (type mismatches, import paths)  │
│  ├── Run linter + type checker                                   │
│  └── If all green → proceed to commit                            │
│                                                                   │
│  PHASE 4: COMMIT                                                 │
│  ├── Single atomic commit with all changes                       │
│  ├── Commit message references feature spec                      │
│  └── Push to GitHub                                              │
│                                                                   │
│  ISOLATION:                                                       │
│  ├── Each agent works in a git worktree (no conflicts)           │
│  ├── Coordinator merges worktrees after phase 2                  │
│  └── Conflicts resolved by coordinator (types win)               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Implementation Steps

1. **Create `/parallel-build` skill** at `.claude/skills/parallel-build/SKILL.md`
   - Phase 1 prompt: decomposition + contract generation
   - Phase 2: uses Task tool to spawn sub-agents with isolation: "worktree"
   - Phase 3: integration + verification
   - Phase 4: commit

2. **Define stream templates** for common feature types:
   - `api-endpoint`: backend route + frontend hook + E2E test
   - `ui-feature`: component + page + visual test
   - `data-model`: schema migration + backend model + frontend types

3. **Build contract format** (shared between streams):
   ```typescript
   // Generated by Stream D, consumed by A + B
   interface FeatureContract {
     endpoint: string;
     method: 'GET' | 'POST' | 'PUT' | 'DELETE';
     requestType: string;   // TypeScript type name
     responseType: string;   // TypeScript type name
     errorCodes: number[];
   }
   ```

4. **Metrics to track**:
   - Wall-clock time: parallel vs. serial for same feature
   - Integration failure rate (how often phase 3 finds issues)
   - Contract accuracy (how often types match first try)

### Prerequisites
- [x] TaskCreate/TaskUpdate pattern (143 uses already)
- [x] /sync-types skill (already exists)
- [ ] Git worktree support in skills (available via `isolation: "worktree"`)
- [ ] Stream templates for common feature types

### Estimated Effort
- Skill creation: 3-4 hours
- Stream templates: 2-3 hours
- Real-world testing: 2 weeks (5-10 features to calibrate)

### Risk
- **High**: Contract mismatches between parallel agents
- **Mitigation**: Types-first approach (Stream D runs before A + B)
- **Medium**: Merge conflicts in shared files
- **Mitigation**: Each stream has exclusive file ownership (no shared edits)

---

## 9. Self-Healing Production Pipeline

### What It Does
Monitors production errors (Sentry) → triages by severity → writes a failing test that reproduces the error → implements a fix → verifies all tests pass → creates a PR → runs deploy-check.

### Why It Matters
- Current pattern: Sentry alert → human notices → starts Claude session → debugs → fixes → deploys
- Average time from alert to fix: 2-6 hours (depending on when noticed)
- Self-healing target: 15-30 minutes for P1 issues, fully automated

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    /auto-fix-production Skill                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  TRIGGER: Manual (/auto-fix-production) or scheduled (cron)      │
│                                                                   │
│  PHASE 1: TRIAGE                                                 │
│  ├── Query Sentry (MCP) for unresolved errors (last 24h)         │
│  ├── Group by root cause (stack trace similarity)                │
│  ├── Classify severity:                                          │
│  │   ├── P0: crash, data loss, auth bypass → auto-fix + alert    │
│  │   ├── P1: feature broken, 500 errors → auto-fix               │
│  │   └── P2: degraded UX, warnings → document only               │
│  ├── Sort by frequency × severity                                │
│  └── Skip if error is in excluded paths (third-party, infra)     │
│                                                                   │
│  PHASE 2: REPRODUCE (per P0/P1 error)                            │
│  ├── Extract: stack trace, affected file, request context        │
│  ├── Read relevant source files + existing tests                 │
│  ├── Write a failing test that reproduces the error:             │
│  │   ├── Unit test if the error is in a utility/service          │
│  │   ├── E2E test if the error is in an API route/page           │
│  │   └── Verify the test actually fails (not a flaky pass)       │
│  └── If unable to reproduce → skip, document in report           │
│                                                                   │
│  PHASE 3: FIX                                                    │
│  ├── Implement minimal fix (smallest change that makes test pass)│
│  ├── Run affected test → verify it passes                        │
│  ├── Run full test suite → verify no regressions                 │
│  └── If fix introduces regressions → revert, try alternative     │
│                                                                   │
│  PHASE 4: PR                                                     │
│  ├── Create branch: fix/sentry-{issue-id}                        │
│  ├── Commit with message linking Sentry issue                    │
│  ├── Create PR via gh CLI:                                       │
│  │   ├── Title: "fix: [Sentry-{id}] {error summary}"            │
│  │   ├── Body: root cause, fix explanation, test added           │
│  │   └── Labels: auto-fix, sentry                                │
│  └── Request review (human required for merge)                   │
│                                                                   │
│  PHASE 5: VERIFY                                                 │
│  ├── Run /deploy-check against staging (if available)            │
│  └── Confirm Sentry error stops recurring after deploy           │
│                                                                   │
│  PHASE 6: REPORT                                                 │
│  ├── Markdown incident report:                                   │
│  │   ├── Errors found (count by severity)                        │
│  │   ├── Root causes identified                                  │
│  │   ├── Fixes applied (with PR links)                           │
│  │   ├── Tests added                                             │
│  │   └── Errors skipped (with reasons)                           │
│  └── Post report to GitHub Issue or Slack (via n8n webhook)      │
│                                                                   │
│  SAFETY RAILS:                                                   │
│  ├── NEVER deploy directly to production — always PR flow        │
│  ├── NEVER touch auth, payments, or data deletion without flag   │
│  ├── Human review required on ALL PRs                            │
│  ├── Max 5 fixes per run (prevent runaway changes)               │
│  ├── Max 30 minutes total runtime                                │
│  └── If Sentry rate > 100 errors/hour → alert human, don't fix  │
│      (likely infra issue, not code bug)                          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Implementation Steps

1. **Phase A: Sentry MCP integration** (prerequisite)
   - Verify Sentry MCP server is configured and accessible
   - Test: can Claude query unresolved issues, read stack traces, get event details?
   - If not connected: set up Sentry MCP with project DSN + auth token

2. **Phase B: Create `/auto-fix-production` skill**
   - Skill prompt follows the 6-phase architecture above
   - Includes safety rails as non-negotiable constraints
   - References project test commands and deploy-check skill

3. **Phase C: Headless scheduled runs**
   ```bash
   # Scheduled via cron or GitHub Actions
   claude -p "Run /auto-fix-production" \
     --allowedTools "Bash,Read,Edit,Grep,Glob,mcp__sentry__*" \
     --max-turns 75
   ```

4. **Phase D: n8n webhook integration** (optional)
   - Sentry webhook → n8n → triggers Claude Code headless
   - n8n posts summary to Slack channel
   - Closes the loop: error → fix → PR → review → deploy → resolved

5. **Metrics to track**:
   - Mean time to PR (from error detection to PR creation)
   - Fix success rate (PRs that actually resolve the Sentry issue)
   - False positive rate (PRs that don't help or introduce regressions)
   - Human override rate (% of PRs that need manual changes before merge)

### Prerequisites
- [x] Sentry MCP server (configured in project)
- [x] /deploy-check skill (already exists)
- [x] gh CLI (available)
- [ ] Sentry project with DSN configured in production
- [ ] GitHub Actions secrets for Claude API + Sentry auth token
- [ ] n8n instance on Railway (for webhook automation)

### Estimated Effort
- Phase A (Sentry MCP): 1-2 hours
- Phase B (Skill creation): 3-4 hours
- Phase C (Headless/CI): 2-3 hours
- Phase D (n8n integration): 3-4 hours
- Testing and tuning: 2-3 weeks of real-world usage

### Risk
- **High**: False fixes that pass tests but don't resolve the actual production error
- **Mitigation**: Sentry issue tracking — verify error count drops post-deploy
- **Medium**: Sentry rate limiting or MCP timeout during triage
- **Mitigation**: Batch queries, cache recent issues, set timeout limits
- **Low**: Runaway PR creation flooding review queue
- **Mitigation**: Max 5 fixes per run, daily cap

---

## Implementation Priority

| Item | Dependencies | Effort | Impact | Start When |
|------|-------------|--------|--------|------------|
| **7. Autofix loops** | Quick wins (done), headless Claude | 1 week | High (saves 44 friction events) | Now |
| **8. Parallel multi-agent** | /sync-types skill, worktree support | 2 weeks | High (3-4x feature speed) | After item 7 is tuned |
| **9. Self-healing pipeline** | Sentry MCP, n8n, item 7 patterns | 3 weeks | Highest (zero-HITL bug fixes) | After items 7+8 proven |

**Recommended sequence**: 7 → 8 → 9. Each builds on patterns proven in the previous item.

---

*Generated: 2026-02-28*
*Based on: Claude Code Insights analysis of 92 sessions, 102 commits, 189 hours*
