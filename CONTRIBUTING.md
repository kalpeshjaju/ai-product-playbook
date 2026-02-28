# Contributing to AI Product Playbook

> **For any LLM (Claude, Gemini, GPT, Cursor) or human contributor.**

## Read First (In Order)

1. **`CLAUDE.md`** — Project rules, conventions, source of truth for all LLMs
2. **`LLM-MAINTAINED-ENTERPRISE-PLAYBOOK.md`** — The playbook (philosophy + practices)
3. **`docs/LEARNING_JOURNAL.md`** — Anti-patterns, lessons learned (avoid repeating mistakes)
4. **`docs/DECISIONS.md`** — Architecture choices and rationale

## Quality Gates (MUST Pass Before Commit)

```bash
# Run whatever quality checks apply to the current stack
# These will be defined as tools/projects are added

# Universal checks (always apply)
bash scripts/hallucination_check.sh        # Catch phantom imports, fabricated APIs
python scripts/check_architecture_limits.py # File < 600 lines, functions < 120 lines
bash scripts/check_doc_freshness.sh        # Docs updated when code changes
```

All of these run automatically in CI (`.github/workflows/ci.yml`).

## Code Standards

### File Headers (Required on Every New File)

**Python:**
```python
"""
FILE PURPOSE: [What this file does in one line]

WHY: [Business problem it solves]
HOW: [High-level approach]

DEPENDENCIES: [External services/libraries used]

AUTHOR: [LLM name or human]
LAST UPDATED: YYYY-MM-DD
"""
```

**TypeScript:**
```typescript
/**
 * FILE PURPOSE: [What this file does in one line]
 *
 * WHY: [Business problem it solves]
 * HOW: [High-level approach]
 *
 * DEPENDENCIES: [Key imports and why]
 *
 * AUTHOR: [LLM name or human]
 * LAST UPDATED: YYYY-MM-DD
 */
```

### Type Safety
- **Python**: No `Any` types. Use Pydantic models for data shapes. Explicit error types.
- **TypeScript**: `strict: true`. No `any` — use `unknown`. Explicit return types on exports.

### Code Size Limits
- **Files**: < 600 lines (split if larger)
- **Functions**: < 120 lines (refactor if larger)
- **Error messages**: Must include context (what failed, where, why)

## Commit Standards

Use the `.gitmessage` template:

```
feat: Add payment idempotency

## Changes
- What changed and why

## Confidence: HIGH (0.85)
Reason: Tested locally, matches API docs

Co-Authored-By: Claude <noreply@anthropic.com>
```

## After Significant Work

### Update Learning Journal
Add an entry to `docs/LEARNING_JOURNAL.md`:
```markdown
## YYYY-MM-DD: [Task Name]

**What happened**: [What was built]
**What worked**: [Successful approaches]
**What failed**: [Failed attempts + why]
**Lesson learned**: [Key insight]
**Next time**: [How to improve]
```

## Multi-LLM Collaboration

| Task | Best LLM | Why |
|------|----------|-----|
| Feature building | Claude | Long-form reasoning, understands context deeply |
| Code review | Gemini | Fast analysis, catches edge cases |
| Optimization | GPT-5 | Strong performance tuning |
| Auto-complete | Cursor | Real-time suggestions, minimal friction |
| Debugging | Claude | Systematic root cause analysis |
| Tests | Any | All good at test generation |

When handing off to another LLM:
1. Ensure all documentation is updated
2. Include "For LLM Reviewers" section in commit/PR
3. Provide context in comments (WHY, not just WHAT)
4. Use explicit types (not inferred)
