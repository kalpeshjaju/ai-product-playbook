# Learning Journal

> **MANDATORY READ before every implementation task.**
> Every LLM must scan at minimum the Anti-Pattern Registry (bottom) before starting work.
> After implementation: add entry if you encountered failures, workarounds, or non-obvious solutions.

---

## Entries

## 2026-02-28: Import 7 LLM Resilience Patterns from Production Projects

**What happened**: Cross-referenced 28 gaps from ui-ux-audit-tool Bible Gap Analysis against playbook. Identified 7 highest-value patterns not yet documented. Added all 7 to playbook (v6.1.0 → v6.2.0) with production code examples. Imported implementation code into `src/resilience/`.

**What worked**:
- Using Explore agent to find all implementation code across two projects in parallel
- Adapting project-specific code to be project-agnostic (removed DB dependencies, made pricing configurable)
- Adding rules to existing classification system (Appendix D) alongside playbook content

**What failed**: N/A (documentation task, no runtime failures)

**Lesson learned**: The gap between "LLM returned a response" and "the response is usable" is where most production failures happen. Five of the seven gaps (JSON extraction, data falsification, fallback monitoring, timeout alignment, prioritized processing) address this exact gap. Cost tracking needs BOTH provider and agent layers — they answer different questions.

**Next time**: When adding new sections to a large document, always update: Table of Contents, "What No Tool Solves" (Appendix B), Rule Classification (Appendix D), and version footer. Missing any of these causes drift.

---

## 2026-03-01: CI Hardening + Tier 2 Docs + Braintrust Eval + Prompt Promotion + Full Deploy

**What happened**: Closed 4 Tier 2 gaps: rewrote 3 stub CI scripts to real blocking gates, created 4 docs (ARCHITECTURE, DATA_MODEL, API_CONTRACTS, SECURITY), rewrote Braintrust eval with SDK + dataset, added prompt promotion ladder (0→10→50→100%). Fixed all API type-check errors (11→0). Provisioned Railway services (PostgreSQL, Redis, LiteLLM), set 16 GitHub secrets, wired env vars across Railway/Vercel, deployed API + LiteLLM to production.

**What worked**:
- Reading all files before editing — avoided hallucinating Drizzle APIs
- Running `check-api-contracts.sh` iteratively to debug regex extraction (3 rounds to get it right)
- Using Railway variable references (`${{Postgres.DATABASE_URL}}`) for cross-service wiring
- Creating tables via raw SQL when `drizzle-kit push` failed due to missing pgvector extension

**What failed**:
- **Drizzle double `.where()` chaining** — silently compiles but fails type-check. Fix: use `and()` for compound conditions
- **ioredis default import** — `import Redis from 'ioredis'` creates a namespace, not a class. Fix: `import { Redis } from 'ioredis'`
- **pgvector not available** on Railway's default PostgreSQL image. Workaround: created prompt_versions + ai_generations directly, deferred embeddings table
- **check-api-contracts.sh regex extraction** picked up non-route regexes (version patterns). Fix: filter to only patterns containing `/api/`, use Python for reliable regex parsing over sed

**Lesson learned**: Railway's default PostgreSQL doesn't bundle pgvector. Plan for a custom Docker image or Supabase if vector search is a hard requirement. Also: shell scripts that parse regex from source code are fragile — use Python for anything beyond simple grep.

**Next time**: For CI gate scripts that parse source code, write a quick test case before wiring to CI. Would have caught the regex false positives earlier.

---

<!-- Add entries as work happens. Format:

## YYYY-MM-DD: [Task Name]

**What happened**: [What was built]
**What worked**: [Successful approaches]
**What failed**: [Failed attempts + why]
**Lesson learned**: [Key insight]
**Next time**: [How to improve]

-->

---

## Anti-Pattern Registry

> Quick-reference table. Add a row when you discover a new anti-pattern.

| Anti-Pattern | What Goes Wrong | Prevention | Date Added |
|-------------|----------------|------------|------------|
| Deploy from local CLI | Wrong directory gets deployed | Git-based deploy only (push to main) | 2026-02-28 |
| Skip learning journal | Same mistakes repeated across sessions | Read last 50 lines before every task | 2026-02-28 |
| Modify code without reading it first | Hallucinated APIs, phantom imports | Read file before editing | 2026-02-28 |
| `JSON.parse()` on raw LLM output | 15-30% failure rate in production | Use multi-strategy extractor with repair | 2026-02-28 |
| `\|\|` with LLM response fields | Fabricates data when LLM returns empty | Use `??` (nullish coalescing) + track empties | 2026-02-28 |
| Agent timeout = executor timeout | Agent cleanup code never runs | Agent < executor < HTTP timeout hierarchy | 2026-02-28 |
| Mock unit under test in tests | Tests pass but test nothing real | Mock data boundaries only (network, DB) | 2026-02-28 |
| Process findings in arbitrary order under timeout | Critical issues get dropped | Sort by severity before truncating | 2026-02-28 |
| Track cost at one layer only | Missing either billing truth or attribution truth | Dual-layer: provider + agent | 2026-02-28 |
| No fallback rate monitoring | Silent degradation hidden by resilience patterns | Track primary vs fallback invocation rates | 2026-02-28 |
| Chain `.where().where()` in Drizzle | Compiles but fails type-check; second where ignored at runtime | Use `and()` for compound conditions | 2026-03-01 |
| `import Redis from 'ioredis'` with NodeNext | Namespace import, not constructable class | Use `import { Redis } from 'ioredis'` | 2026-03-01 |
| Assume Railway PostgreSQL has pgvector | Extension not available on default image | Create tables without vector type, or use custom Postgres image | 2026-03-01 |
| Parse source code regexes with sed/grep | Slashes in regex break sed delimiters, false positives | Use Python for regex extraction from source code | 2026-03-01 |
