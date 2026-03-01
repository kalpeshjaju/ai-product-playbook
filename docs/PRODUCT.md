# Product Definition

> **Owner**: Kalpesh Jaju (non-coder approval required for changes)
> **Last updated**: 2026-03-01

## What This Product Does

AI Product Playbook is an operational toolkit for teams building AI/LLM-powered products. It provides a reference enterprise playbook (333K+ words) plus production infrastructure — an LLM gateway, cost tracking, prompt versioning, guardrails, and observability — so teams can ship AI features with production-grade reliability instead of reinventing every safety layer.

## Who Uses It

### Persona 1: AI Product Leader
- **Goal**: Ship AI features with enterprise-grade reliability and cost control
- **Pain today**: Every team rebuilds the same guardrails, cost limits, and eval pipelines from scratch
- **Success looks like**: Deploy a new AI feature with rate limiting, cost caps, prompt versioning, and observability in days, not months

### Persona 2: ML/AI Engineer
- **Goal**: Reliable multi-model inference with fallback chains and quality monitoring
- **Pain today**: Raw LLM API calls with no caching, no fallback, no cost visibility
- **Success looks like**: Single LiteLLM proxy endpoint with automatic fallback, Redis caching, Langfuse tracing, and token-level cost tracking

## Core Actions (What a User Can Do)
1. Route LLM calls through unified gateway (LiteLLM) → automatic model fallback, caching, cost tracking
2. Version and A/B test prompts → create versions, set traffic allocation, promote via ladder (0→10→50→100%)
3. Monitor costs and quality → per-agent cost breakdown, generation stats, quality scores, guardrail triggers
4. Ingest and search documents → upload docs, generate embeddings, semantic search via pgvector
5. Track user preferences and memory → per-user preference graphs, agent memory layer

## What CANNOT Happen (Business Rules & Legal Constraints)
- [x] Monthly cost cannot exceed MAX_COST budget cap (enforced by cost-guard middleware)
- [x] Daily token usage cannot exceed 100K tokens/user (enforced by rate limiter)
- [x] LLM responses must pass output guardrails (regex + LlamaGuard) before reaching users
- [x] API keys required for all non-health endpoints (fail-open only when API_KEYS env var is empty)

## External Services
| Service | Purpose | Cost |
|---------|---------|------|
| Railway | API server + PostgreSQL + Redis hosting | ~$20/mo |
| Vercel | Next.js web + admin app hosting | Free tier |
| LiteLLM | Unified LLM proxy (self-hosted on Railway) | $0 (OSS) |
| Langfuse | LLM observability and tracing | Free tier |
| Sentry | Error tracking | Free tier |
| PostHog | Product analytics | Free tier |
| Deepgram | Audio transcription (Tier 2) | Pay-per-use |
| Together AI | LlamaGuard guardrail model | Pay-per-use |

## Scale
- Expected users: 10-50 (team/org internal tool)
- Expected data volume: <10GB (playbook + documents + embeddings)
- Availability target: 99.5% (Railway SLA)

## Budget
- Monthly infra budget: $50
- Monthly LLM API budget: $100
