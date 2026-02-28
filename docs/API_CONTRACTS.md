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
