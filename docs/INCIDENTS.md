# Incident Log

> Append-only record of production incidents.
> Every incident gets a post-mortem. Every post-mortem produces a prevention check.
> Last updated: 2026-03-02

---

## Format

```markdown
### INC-NNN: [Title] — [YYYY-MM-DD]
**Severity**: P0 (service down) | P1 (degraded) | P2 (minor) | P3 (cosmetic)
**Duration**: Xh Ym (detected → resolved)
**Impact**: Who/what was affected
**Root cause**: Why it happened
**Detection**: How we found out (monitoring / user report / CI)
**Resolution**: What fixed it
**Prevention**: What check/automation was added to prevent recurrence
**Linked PR**: #NNN (if applicable)
```

---

## Incidents

### INC-001: Vercel deployment rate limited — 2026-03-02
**Severity**: P3 (cosmetic — CI check shows failure, no user impact)
**Duration**: ~10h (Vercel free tier cooldown)
**Impact**: PR preview deploys blocked; production unaffected (already deployed)
**Root cause**: Many consecutive pushes to fix CI issues exceeded Vercel free tier deployment limit (100/day)
**Detection**: CI check `Vercel – web` and `Vercel – admin` reported "Deployment rate limited"
**Resolution**: Waited for cooldown. Merged PRs with `--admin` flag (bypassing Vercel check)
**Prevention**: Batch CI fixes into fewer pushes. Consider Vercel Pro if deploy volume stays high.
**Linked PR**: #8, #9, #11

---

<!-- Append new incidents above this line -->
