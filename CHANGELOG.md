# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Production hardening: secrets, deploys, CI load tests, smoke tests
- CHANGELOG.md (this file)

## [0.3.0] - 2026-03-01

### Added
- Docker entrypoint runs drizzle migrations + pgvector setup automatically
- `workflow_dispatch` trigger on deploy-api for manual redeploys

### Fixed
- Enable pgvector extension before drizzle push + await async in entrypoint
- Run drizzle-kit push from `apps/api/` directory (non-fatal)
- Use `--ignore-scripts` in Docker to skip zerox postinstall
- Make pgvector step non-fatal so server starts even if extension already exists
- Run release guard before build to avoid dirty state in CI
- Skip dirty-check in CI + fix turbo filter in Dockerfile
- Include `shared-llm` package in API Docker build filter

## [0.2.0] - 2026-02-28

### Added
- Unified `/api/ingest` route with adapter registry dispatch (Input Pillar §19)
- Hash dedup + near-dedup via cosine similarity for documents
- Freshness enforcement — expired doc filter + staleness demotion
- `raw_content`, `chunk_strategy`, `enrichment_status` columns on documents schema
- BullMQ ingestion pipeline with typed job dispatch
- Ingester adapters: API Feed, CSV/Excel, Web (Firecrawl), Image (Tesseract + Zerox), Audio (Deepgram)
- HNSW index on embeddings for cosine similarity search

### Fixed
- `x-admin-key` header check for feedback IDOR bypass
- 3 remaining contract test failures resolved
- Simplified ingestion — typed `sourceType`, adapter-driven MIME discovery, DRY Redis
- CI: apply needrestart fix to e2e and api-contract jobs
- CI: install ghostscript + graphicsmagick before npm ci
- Production-readiness fixes — contract tests, types, audit, deploy

### Changed
- Refactored document parsing into Ingester adapter pattern
- Split deepgram test describe block to fit 120-line file limit

## [0.1.0] - 2026-02-25

### Added
- Initial monorepo setup (Turborepo + npm workspaces)
- Apps: web, admin, api, alexa (stub), mobile (stub)
- Packages: shared-types, shared-ui, shared-llm
- Services: crawl4ai, dspy, litellm, strapi
- CI pipeline with quality gates, contract tests, E2E, security scans
- Deploy workflows for Railway (API) and Vercel (web, admin)
- k6 load tests (smoke, load, stress scenarios)
- Production smoke test workflow with retry logic
- Drizzle ORM schema: ai_generations, documents, embeddings, few_shot_bank, outcomes, prompt_versions, user_preferences
- PostHog analytics, Langfuse observability, Sentry error tracking
- Clerk authentication (fail-open mode)
- LiteLLM proxy for multi-model routing
