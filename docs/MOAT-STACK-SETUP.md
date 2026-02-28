# Moat Stack Setup

> Reference setup for implementing the product strategy moat (Playbook Sections 7, 9, 18, 20–22).
> **Purpose**: Single place to see which tools to use, priority order, and how they fit the playbook pattern.

---

## 1. Tool roster (buy) — organized by priority tier

### Tier 1: P0 — Add Now (required for production)

| # | Tool | Role | Playbook Section | Link |
|---|------|------|-----------------|------|
| 1 | **Promptfoo** | LLM eval harness: golden traces, red-teaming, CI evals. Build datasets; run on Promptfoo. | Section 9 | [promptfoo.dev](https://www.promptfoo.dev/) / [Pricing](https://www.promptfoo.dev/pricing/) |
| 2 | **LiteLLM (open source)** | LLM gateway: routing, fallbacks, multi-provider (OpenAI, Anthropic, OpenRouter/Mercury, etc.). Self-hosted; you own config. | Section 18 | [GitHub LiteLLM](https://github.com/BerriAI/litellm) / [Docs](https://docs.litellm.com/) |
| 3 | **Langfuse** | LLM observability: traces, prompt versions, cost, scores. Query via API; do not replicate full trace store into your DB. | Section 18 | [langfuse.com](https://langfuse.com/) / [Pricing](https://langfuse.com/pricing) |
| 4 | **LlamaFirewall** | LLM output guardrails: 3-layer defense (PromptGuard 2, Agent Alignment Checker, CodeShield). OSS, model-agnostic. | Section 7 | [GitHub LlamaFirewall](https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall) |
| 5 | **Instructor** | Structured output: Pydantic-based, works with LiteLLM/OpenAI/Anthropic. Automatic retries on validation failure. | Section 18 | [GitHub Instructor](https://github.com/jxnl/instructor) / [Docs](https://python.useinstructor.com/) |
| 6 | **Redis LangCache** | Semantic caching: 15x faster lookups, 70% token cost reduction. Vector similarity built into Redis Stack. | Section 18 | [redis.io](https://redis.io/docs/latest/develop/interact/search-and-query/advanced-concepts/vectors/) |

### Tier 2: P1 — Add at Growth Stage (100+ users, repeat interactions)

| # | Tool | Role | Playbook Section | Link |
|---|------|------|-----------------|------|
| 7 | **Composio** | Agent tool integrations: 1000+ tools (Slack, GitHub, Gmail, etc.), auth, execution. Use when AI agents take real-world actions. | Section 20 | [composio.dev](https://composio.dev/) / [Pricing](https://composio.dev/pricing/) |
| 8 | **Inception (Mercury)** | Layer 1 option: diffusion LLM, parallel tokens, low latency/cost. Add as a model in your gateway for speed-sensitive paths. | Section 20 | [inceptionlabs.ai](https://www.inceptionlabs.ai/) / [Models & pricing](https://www.inceptionlabs.ai/models#pricing) |
| 9 | **Mem0 or Zep** | Agent memory layer: per-user preference graphs (Mem0) or temporal knowledge graphs (Zep). Enables persistent personalization. | Section 20 | [mem0.ai](https://mem0.ai/) / [getzep.com](https://www.getzep.com/) |
| 10 | **DSPy** | Automated prompt optimization: treats prompts as optimizable programs. Finds better prompts algorithmically. | Section 20 | [GitHub DSPy](https://github.com/stanfordnlp/dspy) / [Docs](https://dspy.ai/) |
| 11 | **RouteLLM** | Intelligent model routing: ML-based per-query routing on top of LiteLLM. 40-60% cost reduction potential. | Section 18 | [GitHub RouteLLM](https://github.com/lm-sys/RouteLLM) |
| 12 | **OpenPipe** | Fine-tuning pipeline: captures production traffic → fine-tunes smaller models → replaces expensive ones. | Section 20 | [openpipe.ai](https://openpipe.ai/) |

### Tier 3: P2 — Add at Scale (1000+ users, mature eval pipeline)

| # | Tool | Role | Playbook Section | Link |
|---|------|------|-----------------|------|
| 13 | **Braintrust** | CI/CD eval blocking: merge blocking with statistical significance testing. Auto-scoring. | Section 9 | [braintrust.dev](https://www.braintrust.dev/) / [Pricing](https://www.braintrust.dev/pricing) |
| 14 | **Qodo Cover** | AI test generation: analyzes codebase, identifies untested paths, generates meaningful tests. | Section 22 | [qodo.ai](https://www.qodo.ai/) |
| 15 | **Gretel / Tonic** | Synthetic data: scale eval datasets 10-50x with privacy-safe synthetic data from real samples. | Section 22 | [gretel.ai](https://gretel.ai/) / [tonic.ai](https://www.tonic.ai/) |

---

## 2. Prompt versioning + A/B testing — hybrid (build + buy)

**Playbook pattern**: Store prompt versions in **your DB**; route traffic with **feature flags**; measure in `ai_generations` + observability.

### Build (source of truth)

- **DB table**: `prompt_versions` (or equivalent) — `prompt_name`, `version`, `content_hash`, `eval_score`, `active_pct`, `author`.
- **Batch promotion logic**: e.g. 10% → 50% → 100% (or rollback) based on eval scores and accept rates from `ai_generations`.

### Buy (routing and experiments)

| Approach | Tools | When |
|----------|--------|------|
| **Playbook default** | **Build:** `prompt_versions` table + batch promotion. **Buy:** **PostHog** for feature flags + analytics. | Fits most teams; one stack for flags and product analytics. |
| **Enterprise / AI-specific** | **Buy:** **LaunchDarkly** (AI model + prompt flags, AI Experiments) or **Langfuse A/B**. | When you want managed AI experiment workflows and are willing to pay. |

**Verdict**: Build the source of truth (DB + logic); buy PostHog (or LaunchDarkly / Langfuse) for routing and experiments.

---

## 3. Set-up checklist

Use this to get the stack "ready" without missing a piece.

### Tier 1 (P0 — do these first)

- [ ] **Promptfoo**: Install (CLI/npm), add eval config, run first eval; optionally wire into CI.
- [ ] **LiteLLM**: Deploy proxy (e.g. Docker/Helm), configure providers, set routing rules; point app at proxy URL.
- [ ] **Langfuse**: Deploy (cloud or self-host), set `LANGFUSE_*` env vars, instrument LLM calls; confirm traces and cost show up.
- [ ] **LlamaFirewall**: Install, configure guardrail layers (at minimum: PromptGuard 2 for input scanning); wire into LLM response pipeline so all user-facing output passes through.
- [ ] **Instructor**: Install (`pip install instructor`), replace raw `JSON.parse()` calls with Instructor-wrapped LLM calls; confirm structured output works with your LiteLLM gateway.
- [ ] **Redis LangCache**: Deploy Redis Stack, configure semantic cache TTLs (1h conversational, 24h factual); wire into LiteLLM caching config.
- [ ] **Prompt versioning**: Create `prompt_versions` table (or equivalent), implement load-by-version in app; add batch job or script for promotion/rollback.
- [ ] **Feature flags for A/B**: Set up PostHog (or LaunchDarkly / Langfuse A/B); create flag(s) for prompt version routing; ensure every request logs `prompt_version` into `ai_generations`.
- [ ] **Identity**: Same `userId` (and optionally `session_id`) in Langfuse, PostHog, and your DB for every request (playbook cardinal rule).

### Tier 2 (P1 — add when you have repeat users)

- [ ] **Composio** (if agents need tools): Sign up, connect at least one toolkit (e.g. Slack or GitHub), wire agent SDK to Composio.
- [ ] **Inception Mercury** (if using): Get API access; add Mercury as a provider in LiteLLM (e.g. via OpenRouter or direct); add routing rule for latency-sensitive tasks.
- [ ] **Mem0 or Zep**: Choose based on needs (Mem0 for preference graphs, Zep for temporal recall); deploy and wire into context injection pipeline.
- [ ] **DSPy**: Install, define first signature + metric function for your primary task; run optimizer with 50+ labeled examples; deploy winning prompt through prompt versioning table.
- [ ] **RouteLLM**: Install, configure as custom router in LiteLLM; run A/B test comparing ML routing vs static routing for 2 weeks; measure cost savings.
- [ ] **OpenPipe**: Connect to production LLM traffic; wait for 1,000+ high-quality examples; trigger first fine-tuning run; compare fine-tuned model eval scores vs prompted model.

### Tier 3 (P2 — add at scale)

- [ ] **Braintrust**: Set up eval suite with 50+ cases; configure merge blocking in GitHub Actions; set statistical significance threshold.
- [ ] **Qodo Cover**: Run coverage analysis on codebase; review generated tests; integrate into CI for gap detection.
- [ ] **Gretel/Tonic**: Generate synthetic eval dataset from production samples; validate synthetic data quality against real data eval scores.

---

## 4. References

- Playbook: **Sections 7, 9, 18, 20–22** (Security, Eval Harness, Cost Control, Intelligence Stack, Data Architecture, Competitive Moat).
- Playbook: **Appendix A** (Reference Stack) for alternative tool picks.
- Playbook: **Section 21** — Plane 3 schema (`ai_generations`, `user_preferences`, `outcomes`); **Section 20** — prompt versioning table and PostHog promotion flow.
