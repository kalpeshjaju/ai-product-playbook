# Secrets Inventory

> **Source of truth** for all API keys, tokens, and secrets across all deployment targets.
> Update this file whenever a secret is added, rotated, or removed.
>
> Last audited: 2026-03-02
> Last rotation: 2026-03-02 (7 keys rotated after accidental terminal exposure)

## Inventory

| Provider | Secret Name | GitHub CI | Railway | Vercel Web | Vercel Admin | Bitwarden Entry |
|----------|-------------|-----------|---------|------------|--------------|-----------------|
| Anthropic | ANTHROPIC_API_KEY | yes | yes | | | Anthropic API |
| OpenAI | OPENAI_API_KEY | yes | yes | | | OpenAI API |
| OpenRouter | OPENROUTER_API_KEY | | yes | | | OpenRouter API |
| Together AI | TOGETHER_AI_API_KEY | yes | yes | | | Together AI API |
| Clerk | CLERK_SECRET_KEY | | | yes | yes | Clerk |
| Clerk | NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | | | yes | yes | Clerk |
| Langfuse | LANGFUSE_PUBLIC_KEY | yes | yes | | | Langfuse |
| Langfuse | LANGFUSE_SECRET_KEY | yes | yes | | | Langfuse |
| Langfuse | LANGFUSE_HOST | | yes | | | Langfuse |
| Sentry | SENTRY_AUTH_TOKEN | yes | | | | Sentry |
| Sentry | NEXT_PUBLIC_SENTRY_DSN | | | yes | yes | Sentry DSN |
| PostHog | POSTHOG_API_KEY | yes | | | | PostHog |
| PostHog | NEXT_PUBLIC_POSTHOG_KEY | | | yes | yes | PostHog (public) |
| Cloudflare | TURNSTILE_SECRET_KEY | yes | | | | Cloudflare Turnstile |
| Cloudflare | NEXT_PUBLIC_TURNSTILE_SITE_KEY | | | | yes | Cloudflare Turnstile |
| Braintrust | BRAINTRUST_API_KEY | yes | | | | Braintrust |
| Chromatic | CHROMATIC_PROJECT_TOKEN | yes | | | | Chromatic |
| GitGuardian | GITGUARDIAN_API_KEY | yes | | | | GitGuardian |
| LiteLLM | LITELLM_API_KEY | yes | | | | LiteLLM |
| LiteLLM | LITELLM_MASTER_KEY | | yes | | | LiteLLM Master |
| LiteLLM | LITELLM_PROXY_URL | yes | | | | LiteLLM (URL) |
| Railway | RAILWAY_TOKEN | yes (monitoring only) | | | | Railway |
| Railway | DATABASE_URL | yes | | | | Railway DB |
| Railway | REDIS_HOST | | yes | | | Railway Redis |
| Railway | REDIS_PASSWORD | | yes | | | Railway Redis |
| Railway | REDIS_PORT | | yes | | | Railway Redis |
| Vercel | VERCEL_TOKEN | yes | | | | Vercel |
| Vercel | VERCEL_ORG_ID | yes | | | | Vercel |
| Vercel | VERCEL_WEB_PROJECT_ID | yes | | | | Vercel Web Project |
| Vercel | VERCEL_ADMIN_PROJECT_ID | yes | | | | Vercel Admin Project |
| Internal | API_INTERNAL_KEY | | | yes | yes | API Internal Key |
| Internal | ADMIN_API_KEY | | | | yes | Admin API Key |
| Internal | NEXT_PUBLIC_API_URL | | | yes | yes | API URL (not secret) |

## Summary

| Location | Count |
|----------|-------|
| GitHub Secrets | 22 |
| Railway (LiteLLM service) | ~15 |
| Vercel Web | 6 |
| Vercel Admin | 8 |
| Unique keys total | ~30 |

## Rotation Log

| Date | Keys Rotated | Reason |
|------|-------------|--------|
| 2026-03-02 | LITELLM_MASTER_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, TOGETHER_AI_API_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY | Accidental plain-text exposure via `railway variables --json` |

## Rules

- **Never run `railway variables --json`** — it prints all values in plain text
- **Never paste secrets in chat or conversation** — use `gh secret set` (hidden input)
- **Rotate immediately** if a key is exposed in terminal, logs, or chat
- **Update this file** whenever a secret is added, rotated, or removed
- **Store in Bitwarden first**, then copy to GitHub/Railway/Vercel
- **Review quarterly** — check for unused keys, expired tokens, weak passwords
