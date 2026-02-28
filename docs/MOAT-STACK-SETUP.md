# Moat Stack Setup

> Reference setup for implementing the product strategy moat (Playbook Sections 20–22).  
> **Purpose**: Single place to see which tools to use and how prompt versioning + A/B fits the playbook pattern.

---

## 1. Tool roster (buy)

| # | Tool | Role | Link |
|---|------|------|------|
| 1 | **Promptfoo** | LLM eval harness: golden traces, red-teaming, CI evals. Build datasets; run on Promptfoo. | [promptfoo.dev](https://www.promptfoo.dev/) / [Pricing](https://www.promptfoo.dev/pricing/) |
| 2 | **Composio** | Agent tool integrations: 1000+ tools (Slack, GitHub, Gmail, etc.), auth, execution. Use when AI agents take real-world actions. | [composio.dev](https://composio.dev/) / [Pricing](https://composio.dev/pricing/) |
| 3 | **Inception (Mercury)** | Layer 1 option: diffusion LLM, parallel tokens, low latency/cost. Add as a model in your gateway for speed-sensitive paths. | [inceptionlabs.ai](https://www.inceptionlabs.ai/) / [Models & pricing](https://www.inceptionlabs.ai/models#pricing) |
| 4 | **Langfuse** | LLM observability: traces, prompt versions, cost, scores. Query via API; do not replicate full trace store into your DB. | [langfuse.com](https://langfuse.com/) / [Pricing](https://langfuse.com/pricing) |
| 5 | **LiteLLM (open source)** | LLM gateway: routing, fallbacks, multi-provider (OpenAI, Anthropic, OpenRouter/Mercury, etc.). Self-hosted; you own config. | [GitHub LiteLLM](https://github.com/BerriAI/litellm) / [Docs](https://docs.litellm.com/) |

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

Use this to get the stack “ready” without missing a piece.

- [ ] **Promptfoo**: Install (CLI/npm), add eval config, run first eval; optionally wire into CI.
- [ ] **Composio** (if agents need tools): Sign up, connect at least one toolkit (e.g. Slack or GitHub), wire agent SDK to Composio.
- [ ] **Inception Mercury** (if using): Get API access; add Mercury as a provider in LiteLLM (e.g. via OpenRouter or direct); add routing rule for latency-sensitive tasks.
- [ ] **Langfuse**: Deploy (cloud or self-host), set `LANGFUSE_*` env vars, instrument LLM calls; confirm traces and cost show up.
- [ ] **LiteLLM**: Deploy proxy (e.g. Docker/Helm), configure providers (including Mercury if used), set routing rules; point app at proxy URL.
- [ ] **Prompt versioning**: Create `prompt_versions` table (or equivalent), implement load-by-version in app; add batch job or script for promotion/rollback.
- [ ] **Feature flags for A/B**: Set up PostHog (or LaunchDarkly / Langfuse A/B); create flag(s) for prompt version routing; ensure every request logs `prompt_version` into `ai_generations`.
- [ ] **Identity**: Same `userId` (and optionally `session_id`) in Langfuse, PostHog, and your DB for every request (playbook cardinal rule).

---

## 4. References

- Playbook: **Sections 20–22** (Intelligence Stack, Data Architecture for AI Moats, Competitive Moat & Flywheel).
- Playbook: **Appendix A** (Reference Stack) for alternative tool picks.
- Playbook: **Section 21** — Plane 3 schema (`ai_generations`, `user_preferences`, `outcomes`); **Section 20** — prompt versioning table and PostHog promotion flow.
