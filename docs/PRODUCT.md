# Product Definition

> **Owner**: Kalpesh Jaju (non-coder approval required for changes)  
> **Last updated**: 2026-03-01

## What This Product Does
AI Product Playbook is an LLM-governed product + engineering system for building and operating AI features with controlled risk. It provides a concrete API + admin surface for prompt versioning, cost telemetry, feedback loops, document ingestion, embeddings, and preference learning.

The product is designed so a non-coder owner can define intent and constraints while automation enforces quality gates. The goal is to make AI feature delivery predictable: faster iteration without losing security, observability, or operational discipline.

## Who Uses It

### Persona 1: Product Owner / Non-Coder Operator
- **Goal**: Ship AI features safely with clear control over risk, cost, and rollout.
- **Pain today**: AI output quality drifts, infra costs spike, and decisions get lost between sessions.
- **Success looks like**: Faster releases with reliable gates, visible spend, and documented decisions.

### Persona 2: AI Engineer / Platform Builder
- **Goal**: Implement AI endpoints quickly while keeping contracts, telemetry, and auth consistent.
- **Pain today**: Fragile LLM integration patterns and drift between docs, code, and CI.
- **Success looks like**: Reusable shared modules, enforced standards, and passing CI/E2E on every PR.

## Core Actions (What a User Can Do)
1. Manage prompt versions and controlled promotion (`0% → 10% → 50% → 100%`) with quality gates.
2. Ingest documents and run embedding-based retrieval with model-tagged vectors.
3. Track LLM usage/cost and generation quality; attach user feedback and downstream outcomes.
4. Run admin workflows for memory, preferences, and operational controls.

## What CANNOT Happen (Business Rules & Legal Constraints)
- [x] Cross-user access/mutation of user-scoped AI data is forbidden (auth + ownership checks required).
- [x] LLM-facing routes must be budget-guarded (token budget + cost budget) before provider calls.
- [x] API contracts and docs must match implementation for all shipped endpoints.
- [x] Prompt promotion beyond canary requires minimum quality threshold (`eval_score >= 0.70`).

## External Services
| Service | Purpose | Cost |
|---------|---------|------|
| Railway (API + Postgres + Redis) | Hosting API, persistence, rate limiting cache | Variable by usage |
| Vercel (web/admin) | Frontend hosting and preview workflows | Variable by usage |
| LiteLLM | Unified LLM gateway and provider abstraction | OSS + provider costs |
| Cloudflare Turnstile | Bot protection on chat-like endpoints | Free/usage tier |
| Sentry | Error monitoring | Tiered |
| PostHog | Product analytics and experiment telemetry | Tiered |
| Langfuse | LLM observability and trace analytics | Tiered |

## Scale
- Expected users: 100-5,000 active users in current phase
- Expected data volume: up to millions of generation rows + document chunks over time
- Availability target: 99.5% for API and core user/admin flows

## Budget
- Monthly infra budget: $500-$2,000 (current stage target)
- Monthly LLM API budget: $300-$3,000 with hard caps + routing controls
