# API Contracts

> All API routes exposed by `apps/api/`. Source of truth for consumers.
> Server: native Node.js HTTP (no framework). Deployed on Railway.

## Base URL

- **Production**: `https://<railway-app>.up.railway.app`
- **Local**: `http://localhost:3002`

## Common Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes (POST/PATCH) | `application/json` |
| `x-api-key` | No | User API key (used for identity + rate limiting) |
| `x-turnstile-token` | Yes (chat routes) | Cloudflare Turnstile bot verification token |

## CORS

All routes return:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type, x-api-key, x-turnstile-token`
- `Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS`

---

## Routes

### `GET /api/health`

Health check endpoint.

**Response** `200`:
```json
{
  "status": "ok",
  "timestamp": "2026-03-01T00:00:00.000Z"
}
```

---

### `GET /api/entries`

List playbook entries.

**Response** `200`:
```json
[
  {
    "id": "1",
    "title": "JSON Extraction",
    "summary": "Multi-strategy repair",
    "category": "resilience",
    "status": "active"
  }
]
```

---

### `GET /api/users`

List admin users.

**Response** `200`:
```json
[
  {
    "id": "u1",
    "name": "Kalpesh Jaju",
    "email": "kalpesh@example.com",
    "role": "owner"
  }
]
```

---

### `GET /api/prompts/:name/active`

Get the active prompt version for a given prompt name. Uses weighted random
selection when multiple versions have traffic allocation.

**Path params:**
- `name` — Prompt identifier (e.g., `job-classifier`)

**Response** `200`:
```json
{
  "prompt_name": "job-classifier",
  "version": "v1.2.0",
  "content": "You are a job classifier...",
  "content_hash": "abc123...",
  "eval_score": "0.85"
}
```

**Response** `404`:
```json
{
  "error": "No active versions for prompt: job-classifier"
}
```

---

### `POST /api/prompts`

Create a new prompt version. Starts at 0% traffic (no exposure until promoted).

**Request body:**
```json
{
  "prompt_name": "job-classifier",
  "content": "You are a job classifier. Categorize the following...",
  "author": "kalpesh"
}
```

**Response** `201`:
```json
{
  "id": "uuid",
  "promptName": "job-classifier",
  "version": "v1.3.0",
  "content": "...",
  "contentHash": "sha256...",
  "evalScore": null,
  "activePct": 0,
  "author": "kalpesh",
  "createdAt": "2026-03-01T00:00:00.000Z"
}
```

**Response** `400`:
```json
{
  "error": "Required: prompt_name, content, author"
}
```

---

### `PATCH /api/prompts/:id/traffic`

Manually update traffic allocation for a prompt version.
Sum of `active_pct` across all versions of the same prompt must not exceed 100%.

**Path params:**
- `id` — Prompt version UUID

**Request body:**
```json
{
  "active_pct": 50
}
```

**Response** `200`:
```json
{
  "id": "uuid",
  "promptName": "job-classifier",
  "version": "v1.3.0",
  "activePct": 50,
  "..."
}
```

**Response** `400` (over 100%):
```json
{
  "error": "Traffic sum would be 150% (max 100%). Current total: 100%, this version: 0%."
}
```

**Response** `404`:
```json
{
  "error": "Prompt version not found"
}
```

---

### `POST /api/prompts/:name/promote`

Automated promotion through the promotion ladder: 0% → 10% → 50% → 100%.
At 100%, all other versions of the same prompt are set to 0%.
Quality gate: `eval_score >= 0.70` required to promote beyond 10%.

**Path params:**
- `name` — Prompt identifier

**Request body:**
```json
{
  "version": "v1.3.0"
}
```

**Response** `200`:
```json
{
  "promptName": "job-classifier",
  "version": "v1.3.0",
  "previousPct": 10,
  "newPct": 50,
  "nextStep": "Promote again to reach 100%"
}
```

**Response** `400` (quality gate):
```json
{
  "error": "Quality gate: eval_score 0.55 < 0.70 required for promotion beyond 10%"
}
```

**Response** `404`:
```json
{
  "error": "No version v1.3.0 found for prompt: job-classifier"
}
```

---

### `GET /api/costs`

Get the full cost observability report (total cost, per-agent breakdown, latency, error rates).

**Response** `200`:
```json
{
  "totalCostUSD": 1.2345,
  "totalInputTokens": 50000,
  "totalOutputTokens": 10000,
  "byAgent": { "synthesis": { "input": 50000, "output": 10000, "costUSD": 1.2345, "model": "claude-sonnet" } },
  "currency": "USD",
  "byAgentDetailed": { "synthesis": { "callCount": 5, "successCount": 4, "failCount": 1, "errorRate": 0.2, "avgLatencyMs": 1200, "p95LatencyMs": 2500 } },
  "totalCalls": 5,
  "totalSuccesses": 4,
  "totalFailures": 1,
  "overallErrorRate": 0.2,
  "overallAvgLatencyMs": 1200
}
```

---

### `POST /api/costs/reset`

Admin-only reset of all cost tracking data. Requires `x-admin-key` header matching `ADMIN_API_KEY` env var.

**Headers:**
- `x-admin-key` — Must match `ADMIN_API_KEY` env var

**Response** `200`:
```json
{ "status": "reset", "report": { "totalCostUSD": 0, "currency": "USD" } }
```

**Response** `403`:
```json
{ "error": "Forbidden: invalid or missing x-admin-key" }
```

---

### `POST /api/memory`

Add a memory entry for a user/agent. Fail-open when memory provider not configured.

**Request body:**
```json
{
  "content": "User prefers dark mode",
  "userId": "user-123",
  "agentId": "job-matcher",
  "metadata": { "source": "preference" }
}
```

**Response** `201`: `{ "id": "memory-uuid" }`
**Response** `400`: `{ "error": "Required: content, userId" }`
**Response** `200` (disabled): `{ "enabled": false, "message": "No memory provider configured" }`

---

### `GET /api/memory/search?q=...&userId=...`

Search memories by semantic similarity.

**Query params:**
- `q` — Search query (required)
- `userId` — User ID (required)

**Response** `200`: Array of `{ entry: MemoryEntry, score: number }`

---

### `GET /api/memory/:userId`

Get all memories for a user.

**Response** `200`: Array of `MemoryEntry` objects

---

### `DELETE /api/memory/:id`

Delete a specific memory by ID.

**Response** `200`: `{ "deleted": "memory-id" }`

---

### `GET /api/composio/actions?app=...`

List available Composio actions. Fail-open when `COMPOSIO_API_KEY` not set.

**Query params:**
- `app` — Optional app name filter (e.g., `slack`, `github`)

**Response** `200`: Array of `{ name, description, appName, parameters, requiresAuth }`
**Response** `200` (disabled): `{ "enabled": false, "message": "COMPOSIO_API_KEY not set" }`

---

### `POST /api/composio/execute`

Execute a Composio action.

**Request body:**
```json
{
  "action": "SLACK_SEND_MESSAGE",
  "params": { "channel": "#general", "text": "Hello" },
  "entityId": "user-123"
}
```

**Response** `200`: `{ "success": true, "data": {...}, "metadata": {...} }`
**Response** `400`: `{ "error": "Required: action, params" }`

---

### `POST /api/openpipe/log`

Log a training data entry for fine-tuning. Fail-open when `OPENPIPE_API_KEY` not set.

**Request body:**
```json
{
  "messages": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }],
  "idealOutput": "...",
  "tags": { "task": "classification" }
}
```

**Response** `201`: `{ "logged": true }`
**Response** `400`: `{ "error": "Required: messages (array)" }`
**Response** `200` (disabled): `{ "enabled": false, "message": "OPENPIPE_API_KEY not set" }`

---

### `POST /api/openpipe/finetune`

Trigger a fine-tuning job.

**Request body:**
```json
{
  "baseModel": "gpt-4o-mini",
  "datasetFilters": { "task": "classification" },
  "suffix": "classifier-v2"
}
```

**Response** `201`: `{ "jobId": "ft-abc123" }`
**Response** `400`: `{ "error": "Required: baseModel" }`

---

### `GET /api/openpipe/finetune/:jobId`

Get the status of a fine-tuning job.

**Response** `200`:
```json
{
  "id": "ft-abc123",
  "status": "training",
  "baseModel": "gpt-4o-mini",
  "metrics": { "trainingLoss": 0.05 },
  "createdAt": "2026-03-01T00:00:00.000Z"
}
```

**Response** `404`: `{ "error": "Job not found" }`

---

## Cost Budget Guard

Cost budget enforcement on `/api/chat*` and `/api/generate*` routes (after rate limiter):

- **Budget**: Configurable via `MAX_COST` env var (default: $10.00)
- **Response** `429`:
```json
{
  "error": "Cost budget exceeded",
  "report": { "totalCostUSD": 10.5, "currency": "USD" }
}
```

---

## Rate Limiting

Token-based rate limiting on `/api/chat*` and `/api/generate*` routes:

- **Budget**: 100,000 tokens/user/day
- **Window**: Sliding 24-hour via Redis
- **Fail-open**: Requests allowed when Redis unavailable
- **Response** `429`:
```json
{
  "error": "Token budget exceeded",
  "daily_limit": 100000,
  "remaining": 0
}
```

## Bot Protection

Cloudflare Turnstile verification on `/api/chat*` routes:

- Client sends token in `x-turnstile-token` header
- Server validates via Turnstile API
- **Response** `403`:
```json
{
  "error": "Bot verification failed"
}
```
