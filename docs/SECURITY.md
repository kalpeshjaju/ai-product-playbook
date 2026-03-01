# Security

> Security policies and practices for the AI Product Playbook.
> Covers dependency management, coding standards, secrets, guardrails, and incident response.

## Dependency Policy

- **Lock files committed**: `package-lock.json` always committed, never `.gitignore`d
- **Audit on CI**: `scripts/audit-with-allowlist.js` runs as a blocking gate — unfixable vulns in `.audit-allowlist.json` with expiry dates
- **No wildcard versions**: Pin exact or range versions in `package.json`
- **GitGuardian scanning**: Automated in CI as a blocking gate (conditional on `GITGUARDIAN_API_KEY` being set)
- **Semgrep SAST**: `semgrep scan --config=auto --error --severity ERROR` runs as a blocking gate in the `security` CI job
- **Review new deps**: Every new dependency requires justification (bundle size, maintenance status, license)

## Secure Coding Rules

### No `any` types
Use `unknown` with type guards. Untyped data is the #1 source of runtime security bugs.

### Input validation at system boundaries
- Validate all user input in API routes before processing
- Use typed request parsing (not raw `req.body` casts)
- Reject unexpected fields — don't silently pass them through

### No secrets in code
- Environment variables for all credentials
- `.env` files in `.gitignore`
- CI secrets managed via GitHub Secrets or Railway variables
- Never log API keys, tokens, or user credentials

### SQL injection prevention
- All queries via Drizzle ORM (parameterized by default)
- No raw SQL string concatenation
- `check-destructive-sql.sh` CI gate blocks unguarded DROP/TRUNCATE/DELETE

### XSS prevention
- React auto-escapes by default in `apps/web/`
- No `dangerouslySetInnerHTML` without sanitization
- API responses are JSON-only (no HTML rendering server-side)

## Secret Management

| Secret | Where | Purpose |
|--------|-------|---------|
| `LITELLM_API_KEY` | Railway env | LiteLLM proxy authentication |
| `LITELLM_PROXY_URL` | Railway env | LiteLLM proxy endpoint |
| `REDIS_URL` | Railway env | Rate limiter + cache |
| `SENTRY_DSN` | Railway + Vercel env | Error tracking |
| `POSTHOG_API_KEY` | Vercel env (web) | Client analytics |
| `POSTHOG_SERVER_API_KEY` | Railway env (api) | Server-side analytics |
| `LANGFUSE_SECRET_KEY` | Railway env | LLM observability |
| `BRAINTRUST_API_KEY` | GitHub Secrets | CI eval runner |
| `GITGUARDIAN_API_KEY` | GitHub Secrets | Secret scanning |
| `TURNSTILE_SECRET_KEY` | Railway env | Bot verification |

**Rotation policy**: Rotate all keys quarterly or immediately upon suspected exposure.

## Output Guardrails

Multi-layer LLM output validation (§14):

1. **Regex filters** — Block known dangerous patterns (PII, code injection)
2. **LlamaGuard** — Content safety classification
3. **Logging** — `guardrail_triggered[]` array stored in `ai_generations` table
4. **Enforcement status** — `scanOutput()` is mandatory on all routes returning LLM/external text (`transcription.ts`, `composio.ts`, `memory.ts`). CI gate `scripts/check-guardrail-usage.sh` enforces this

## Bot Protection

- **Cloudflare Turnstile** on all `/api/chat*` routes
- Server-side token validation via Turnstile API
- Requests without valid token receive `403 Bot verification failed`
- Configured in `apps/api/src/middleware/turnstile.ts`

## Rate Limiting

- **Token-based** (not request-based) — prevents denial-of-wallet attacks
- **Budget**: 100K tokens/user/24h sliding window
- **Backend**: Redis via ioredis (`apps/api/src/rate-limiter.ts`)
- **Fail-open**: Requests allowed when Redis unavailable (availability > protection)
- **CI gate**: `scripts/check-rate-limit.sh` verifies all LLM call sites include rate limiting

## Incident Response Playbook

### 1. Secret Exposure
1. Revoke the exposed secret immediately
2. Rotate all secrets on the same service
3. Check GitGuardian dashboard for scope of exposure
4. Review git history — force-push to remove if in recent commits
5. Post-mortem: how did the secret get committed?

### 2. Dependency Vulnerability
1. Run `npm audit` to identify severity
2. If critical/high: patch within 24 hours
3. If medium/low: patch within 1 week
4. If no patch available: evaluate mitigation or replacement

### 3. Rate Limit Bypass
1. Check Redis connectivity — is rate limiter failing open?
2. Review `rate-limiter.ts` logs for anomalies
3. If sustained abuse: add IP-level blocking at CDN/Turnstile layer
4. Consider reducing `DAILY_TOKEN_BUDGET` temporarily

### 4. LLM Output Safety Issue
1. Identify which guardrail failed to catch the issue
2. Add the pattern to regex filters immediately
3. Review LlamaGuard configuration for gaps
4. Log the incident in `ai_generations.guardrail_triggered`
5. Post-mortem: add test case to Braintrust eval dataset
