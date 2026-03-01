# Architecture Decisions

> Record every non-trivial technical choice. Future LLMs read this before implementing.
> Format: ACTIVE decisions are followed. SUPERSEDED decisions are historical context only.

## How to Use This File

1. **Before implementing**: Read all ACTIVE decisions.
2. **When making a choice**: Add a new entry before coding.
3. **When reversing a choice**: Mark old entry SUPERSEDED and add a replacement.
4. **Decision IDs**: Sequential (`DEC-001`, `DEC-002`, ...).

---

## ACTIVE Decisions

### DEC-001: Native Node HTTP API [ACTIVE]
**Date**: 2026-03-01  
**Author**: Claude Opus 4.6 + Codex  
**Status**: ACTIVE  
**Revisit when**: Route complexity or middleware needs exceed maintainability limits.

**Problem**: Choose API framework/runtime surface for monorepo backend.  
**Options considered**:
1. Native Node HTTP server.
2. Express/Fastify-style framework.

**Decision**: Use native Node HTTP server in `apps/api/src/server.ts`.  
**Reason**: Minimal dependencies, explicit control flow, low abstraction overhead for LLM maintenance.  
**Consequences**: More manual routing/middleware logic; stricter discipline needed for consistency.

### DEC-002: All LLM Provider Access Goes Through LiteLLM [ACTIVE]
**Date**: 2026-03-01  
**Author**: Claude Opus 4.6 + Codex  
**Status**: ACTIVE  
**Revisit when**: Provider-specific requirements cannot be represented through gateway routing.

**Problem**: Prevent direct, inconsistent provider calls across codebase.  
**Options considered**:
1. Direct provider SDK use in each route.
2. Centralized gateway with shared client wrapper.

**Decision**: Route LLM requests through `createLLMClient()` against LiteLLM proxy.  
**Reason**: Centralizes routing, fallback policy, and observability headers.  
**Consequences**: Gateway availability becomes critical path; requires explicit health and budget controls.

### DEC-003: Prompt Versioning Uses Ladder Promotion with Quality Gate [ACTIVE]
**Date**: 2026-03-01  
**Author**: Claude Opus 4.6 + Codex  
**Status**: ACTIVE  
**Revisit when**: Experiment volume requires multivariate or Bayesian rollout strategy.

**Problem**: Move prompt changes safely from draft to full traffic.  
**Options considered**:
1. Immediate 100% prompt swaps.
2. Controlled ladder with quality threshold.

**Decision**: Use `0% -> 10% -> 50% -> 100%` promotion and require `eval_score >= 0.70` beyond 10%.  
**Reason**: Reduces blast radius and enforces measurable quality before full rollout.  
**Consequences**: Requires maintaining prompt/eval metadata and promotion tooling.

### DEC-004: Auth Model is Tiered with Ownership Enforcement [ACTIVE]
**Date**: 2026-03-01  
**Author**: Claude Opus 4.6 + Codex  
**Status**: ACTIVE  
**Revisit when**: SSO/tenant model requires role-based policies beyond API keys.

**Problem**: Prevent unauthorized API access and cross-user mutations.  
**Options considered**:
1. Public-by-default API with optional keys.
2. Route-tier auth (`public`, `user`, `admin`) + IDOR/ownership checks.

**Decision**: Enforce route tiers in middleware and ownership checks in user-scoped routes (including feedback/outcomes).  
**Reason**: Aligns with playbook security constraints while preserving dev-mode flexibility.  
**Consequences**: Routes must declare/adhere to tier behavior; tests must cover ownership paths.

### DEC-005: Budget Guarding Precedes LLM Calls [ACTIVE]
**Date**: 2026-03-01  
**Author**: Claude Opus 4.6 + Codex  
**Status**: ACTIVE  
**Revisit when**: Dynamic QoS policies require per-tenant adaptive limits.

**Problem**: Control denial-of-wallet risk and spend drift in LLM endpoints.  
**Options considered**:
1. Observe costs only after calls complete.
2. Enforce token and cost budgets before each LLM call site.

**Decision**: Require `checkTokenBudget()` + `checkCostBudget()` on LLM call paths (`chat/generate`, documents embeddings, embedding search).  
**Reason**: Prevents runaway usage at request time, not just after billing data arrives.  
**Consequences**: Accurate callsite detection and test coverage become mandatory CI responsibilities.

### DEC-006: Strapi CMS Deprioritized — Use Drizzle + Clerk Instead [ACTIVE]
**Date**: 2026-03-01
**Author**: Kalpesh Jaju + Claude Opus 4.6
**Status**: ACTIVE
**Revisit when**: Non-technical content editors need a visual CMS, or team grows beyond solo dev.

**Problem**: `/api/entries` and `/api/users` serve hardcoded data. Strapi was scaffolded (`services/strapi/`) as the CMS backend but requires Docker Desktop (not installed) and adds another Railway service.
**Options considered**:
1. Wire Strapi CMS as content backend (scaffolded, needs Docker + deploy).
2. Use existing Postgres + Drizzle for entries, Clerk API for users (zero new infrastructure).
3. Static JSON file checked into repo.

**Decision**: Deprioritize Strapi. When this work is revisited, use Drizzle `playbook_entries` table + Clerk `getUserList()`. Strapi scaffold stays in repo but is not integrated.
**Reason**: Solo dev already has Vercel + Railway + Postgres + Clerk. Strapi adds Docker dependency, another service to deploy, API token management, and CORS config — all for a feature that existing infrastructure already supports. The admin app already has CRUD patterns (PromptManager, Memory browser) that can be reused for entries management.
**Consequences**: `services/strapi/` directory remains as dormant scaffold. Content types defined there (`playbook-entry`, `product-page`) should inform the Drizzle schema when entries table is added. `docker-compose.yml` retains the strapi service definition for potential future use.

### DEC-007: P0 Security — Users Route Admin-Only + CORS Production Block [ACTIVE]
**Date**: 2026-03-02
**Author**: Claude Opus 4.6
**Status**: ACTIVE
**Revisit when**: Public user directory feature is needed (would require a new read-only subset route).

**Problem**: `/api/users` was `public` tier — returns PII (emails, names, roles) from Clerk without auth. CORS defaulted to `*` when `ALLOWED_ORIGINS` unset in production.
**Decision**: (1) `/api/users` tier changed to `admin` (requires `x-admin-key`). (2) CORS in production without `ALLOWED_ORIGINS` no longer sets `Access-Control-Allow-Origin` header (browser blocks cross-origin). Dev/test still allows `*`.
**Reason**: PII exposure and open CORS are P0 security blockers before external user access.
**Consequences**: Admin panel must send `x-admin-key` for user listing. `ALLOWED_ORIGINS` must be set on Railway for cross-origin frontend access (already configured).

---

## SUPERSEDED Decisions

<!-- Add superseded decisions here with replacement references. -->
