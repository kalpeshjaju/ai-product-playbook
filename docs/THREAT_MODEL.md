# Threat Model

> Assets, attackers, vectors, mitigations.
> Reviewed by: LLM (author) + project owner (reviewer).
> Last updated: 2026-03-02

---

## Asset: API Keys & Secrets

**Sensitivity**: CRITICAL
**Storage**: Railway env vars (API), Vercel env vars (web/admin), GitHub Secrets (CI)
**Access**: Server-side only — never exposed to browser
**Threats**:
- Secret leaked in git commit or CI logs
- Env var misconfiguration exposes key to client bundle
**Mitigations**:
- GitGuardian scans every push (`.github/workflows/ci.yml` security job)
- `NEXT_PUBLIC_*` prefix convention — only explicitly public vars reach browser
- API keys hashed with SHA-256 before storage/comparison (`middleware/auth.ts`)
- `.env.example` documents all vars — hallucination check enforces completeness

## Asset: User Data (Clerk)

**Sensitivity**: HIGH (PII — emails, names, roles)
**Storage**: Clerk (hosted) — we don't store user records locally
**Access**: `/api/users` (admin-only, DEC-007)
**Threats**:
- Unauthorized access to user list
- IDOR — user A accessing user B's data
**Mitigations**:
- `/api/users` requires admin tier (`x-admin-key` header)
- IDOR prevention in `middleware/auth.ts` — path + query userId must match authenticated user
- Clerk JWT verification via `@clerk/backend` JWKS

## Asset: LLM API Spend

**Sensitivity**: HIGH (financial — denial-of-wallet)
**Storage**: Cost records in Postgres (`ai_cost_events` table)
**Access**: LiteLLM proxy (Railway) — all LLM calls routed through it
**Threats**:
- Automated abuse drains API budget
- Compromised API key used for bulk requests
**Mitigations**:
- Token-based rate limiting per user via Redis (`rate-limiter.ts`)
- Monthly cost budget cap (`MAX_COST` env var, `cost-guard.ts`)
- Turnstile bot protection on `/api/chat*` routes
- LiteLLM proxy has its own rate limits + model-level budget caps

## Asset: Document Corpus (RAG)

**Sensitivity**: MEDIUM (intellectual property, potentially sensitive content)
**Storage**: Postgres + pgvector (`documents`, `document_embeddings` tables)
**Access**: `/api/documents` (admin for writes), `/api/embeddings/search` (user for reads)
**Threats**:
- RAG corpus poisoning via malicious document ingestion
- Embedding search leaking documents across user boundaries
**Mitigations**:
- Document ingestion requires admin auth
- LlamaGuard output scanning on AI-facing routes (`guardrails/scanner.ts`)
- Embedding search scoped by document metadata (no cross-tenant leakage by default)

## Asset: Production Infrastructure

**Sensitivity**: HIGH
**Storage**: Railway (API, Postgres, Redis, LiteLLM), Vercel (web, admin)
**Access**: Railway dashboard (owner only), Vercel dashboard (owner only)
**Threats**:
- Supply chain attack via compromised npm package
- CI pipeline compromise (malicious GitHub Action)
**Mitigations**:
- `npm ci --ignore-scripts` in CI builds
- GitGuardian + Dependabot monitoring
- Vercel GitHub App with Ignored Build Step (no arbitrary code execution)
- Railway auto-deploys from git push to main only

---

## Attack Surface Summary

| Vector | Risk | Status |
|--------|------|--------|
| Public API endpoints | LOW | Health only — all data routes require auth |
| CORS | LOW | Production blocks when `ALLOWED_ORIGINS` unset (DEC-007) |
| Secret exposure | LOW | GitGuardian + no `NEXT_PUBLIC_` secrets |
| Denial-of-wallet | MEDIUM | Rate limiting + cost cap + Turnstile |
| RAG poisoning | MEDIUM | Admin-only ingestion + LlamaGuard scanning |
| Supply chain | MEDIUM | `--ignore-scripts` + Dependabot |
