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
