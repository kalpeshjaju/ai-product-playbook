# Architecture

> System architecture for the AI Product Playbook monorepo.
> Derived from actual codebase — not speculative.

## System Overview

**Turborepo monorepo** with 3 apps, 3 packages, and 2 services:

```
ai-product-playbook/
├── apps/
│   ├── web/          # Next.js 14 frontend (Vercel)
│   ├── api/          # Node.js HTTP API (Railway)
│   └── admin/        # Admin dashboard
├── packages/
│   ├── shared-llm/   # LLM utilities, identity, cost ledger, eval
│   ├── shared-types/ # TypeScript types shared across apps
│   └── shared-ui/    # Shared UI components
└── services/
    ├── litellm/      # LiteLLM proxy — unified LLM gateway
    └── dspy/         # DSPy prompt optimization service
```

## LLM Gateway

All LLM calls route through the **LiteLLM proxy** (`services/litellm/`):

- Single endpoint for all providers (OpenAI, Anthropic, Together AI)
- Query routing via `routeQuery()` in `packages/shared-llm/`
- Response caching via Redis (Railway-hosted)
- Model fallback chain configured in LiteLLM config

```
Client → API server → LiteLLM proxy → Provider (Claude, GPT, etc.)
                         ↓
                      Langfuse (observability)
```

## Data Flow

1. **Client request** → `apps/api/src/server.ts` (native Node.js HTTP)
2. **Bot protection** → Turnstile verification on `/api/chat*` routes
3. **Rate limiting** → `checkTokenBudget()` — token-based, 100K/user/day via Redis sliding window
4. **Identity** → `createUserContext()` extracts user ID, sets Langfuse headers + PostHog identify
5. **LLM routing** → LiteLLM proxy handles model selection, caching, fallback
6. **Observability** → Langfuse traces, PostHog analytics, Sentry errors

## Guardrails Pipeline

Multi-layer output validation (§14):

```
LLM response → Regex filters → LlamaGuard check → Pass/Fail
                                    ↓
                              guardrail_triggered[] logged in ai_generations
```

## Identity Flow

`createUserContext()` (in `packages/shared-llm/`) creates a unified user context:

- Extracts user ID from request headers (`x-api-key`, IP fallback)
- Sets Langfuse trace headers for per-user observability
- PostHog server-side identify for analytics correlation

## Cost Control

**CostLedger** dual-layer system (§18):

1. **Token-based rate limiting** — `apps/api/src/rate-limiter.ts`
   - Redis sliding window (24h)
   - 100K tokens/user/day budget
   - Fail-open when Redis unavailable
2. **Cost tracking** — `ai_generations.cost_usd` logged per call
   - Aggregated for billing dashboards
   - Alerts on budget threshold breach

## Prompt A/B Testing

Two-layer approach (§22):

1. **PostHog feature flags** → variant name maps to prompt version
2. **Weighted random fallback** → `prompt_versions.active_pct` for traffic allocation
3. **Promotion ladder** → 0% → 10% → 50% → 100%
4. **Quality gate** → `eval_score >= 0.70` required to promote beyond 10%

## Key Conventions

- **Import style**: `.js` extensions required (NodeNext module resolution)
- **File limits**: <400 lines per file, <75 lines per function
- **Type safety**: No `any` — use `unknown` with type guards
- **Error messages**: Must include context (what failed, where, why)
- **Top-level comments**: Every file explains what it does and why it exists
