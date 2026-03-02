# Runbook: LiteLLM Proxy Down

> When the LiteLLM gateway is unreachable. All LLM calls fail.

## Symptoms

- `/api/health` returns `services.litellm: "error"`
- All `/api/chat/*`, `/api/documents` (embedding), and LLM-powered routes return 502/503
- Logs show "ECONNREFUSED" or timeout errors to `LITELLM_PROXY_URL`
- Langfuse shows zero traces (no LLM calls reaching providers)

## Impact

**Critical** — LiteLLM is the single gateway for all LLM providers (DEC-002). When it's down:
- No chat/generation endpoints work
- No document embedding works
- No LlamaGuard output scanning works
- Cost tracking stops (no calls to track)

Non-LLM routes (health, costs read, users) continue working.

## LLM Action

1. Check Railway dashboard → LiteLLM service status
2. Check LiteLLM logs: `railway logs -s litellm` for crash reason
3. Common causes:
   - **OOM**: LiteLLM loaded too many models → restart + check `config.yaml`
   - **Bad config**: Recent config change broke startup → revert last deploy
   - **Provider key expired**: Check `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` validity
4. Restart LiteLLM service on Railway
5. Verify: `curl $LITELLM_PROXY_URL/health/liveliness`

## Non-Coder Action

1. Open Railway dashboard → check LiteLLM service
2. If "Crashed" → click **Restart**
3. Wait 3 minutes (LiteLLM takes longer to start — loads model configs)
4. Check: visit `$LITELLM_PROXY_URL/health/liveliness` → should return `{"status":"healthy"}`

## Escalation

- LiteLLM GitHub Issues: https://github.com/BerriAI/litellm/issues
- Railway support: support@railway.app (for infra issues)
- Check LiteLLM Discord for known outages

## Recovery Verification

1. `GET /api/health` → `services.litellm: "ok"`
2. Make a test chat request → should return LLM response
3. Check Langfuse → new traces appearing
4. Check LiteLLM admin UI → all 7 models showing healthy

## Post-Mortem

- Log in `docs/INCIDENTS.md`
- If OOM: reduce loaded models or increase Railway service memory
- If config issue: add config validation to deploy pipeline
- If provider outage: verify LiteLLM fallback routing is configured
