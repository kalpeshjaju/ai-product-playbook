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
| `x-api-key` | Yes (non-public routes) | User API key — required for all routes except `/api/health`, `/api/entries`, `/api/users` |
| `x-admin-key` | Yes (admin routes) | Admin key for mutation routes (costs/reset, composio/execute, documents, etc.) |
| `x-turnstile-token` | Yes (chat routes) | Cloudflare Turnstile bot verification token |

## CORS

When `ALLOWED_ORIGINS` env var is set, only listed origins receive `Access-Control-Allow-Origin`.
When not set, falls back to `*` (development mode).

- `Access-Control-Allow-Origin: <request origin>` (if in allowlist) or `*` (fallback)
- `Access-Control-Allow-Headers: Content-Type, x-api-key, x-turnstile-token, x-admin-key`
- `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`

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

### `POST /api/generations`

Log an AI generation to the `ai_generations` table (§21 Plane 3).

**Request body:**
```json
{
  "userId": "user-123",
  "sessionId": "sess-abc",
  "promptText": "You are a job classifier...",
  "promptVersion": "v1.2.0",
  "taskType": "classification",
  "inputTokens": 150,
  "responseText": "This is a software engineering role...",
  "outputTokens": 50,
  "model": "claude-sonnet",
  "modelVersion": "claude-sonnet-4-6",
  "latencyMs": 1200,
  "costUsd": 0.003,
  "qualityScore": 0.85,
  "hallucination": false,
  "guardrailTriggered": []
}
```

**Response** `201`: The created generation row.

**Response** `400`:
```json
{ "error": "Required field missing: promptText" }
```

---

### `GET /api/generations?userId=...&limit=20&offset=0`

Query AI generation history for a user with pagination.

**Query params:**
- `userId` — required
- `limit` — max 100, default 20
- `offset` — default 0

**Response** `200`: Array of `ai_generations` rows, ordered by `created_at` descending.

---

### `GET /api/generations/stats?userId=...&days=7`

Aggregated generation stats for a user over the last N days.

**Query params:**
- `userId` — required
- `days` — default 7

**Response** `200`:
```json
{
  "totalCalls": 42,
  "avgLatencyMs": 1150,
  "avgQualityScore": 0.82,
  "totalCostUsd": 0.156
}
```

---

### `PATCH /api/feedback/:generationId`

Update feedback on an AI generation. Provide at least one of the feedback fields.

**Path params:**
- `generationId` — UUID of the generation

**Request body:**
```json
{
  "userFeedback": "accepted",
  "thumbs": 1,
  "userEditDiff": "Changed 'software' to 'data science'"
}
```

Valid `userFeedback` values: `accepted`, `rejected`, `edited`, `regenerated`, `ignored`.
Valid `thumbs` values: `-1`, `0`, `1`.

**Response** `200`: The updated generation row.

**Response** `400`:
```json
{ "error": "Provide at least one of: userFeedback, thumbs, userEditDiff" }
```

**Response** `404`:
```json
{ "error": "Generation not found: <id>" }
```

---

### `POST /api/feedback/:generationId/outcome`

Create an outcome record linked to an AI generation (§22 Moat Tracking).

**Path params:**
- `generationId` — UUID of the generation

**Request body:**
```json
{
  "userId": "user-123",
  "outcomeType": "conversion",
  "outcomeValue": { "applied": true, "source": "recommendation" }
}
```

Valid `outcomeType` values: `conversion`, `task_completed`, `abandoned`.

**Response** `201`: The created outcome row.

**Response** `404`:
```json
{ "error": "Generation not found: <id>" }
```

---

### `POST /api/documents`

Ingest a document: chunks content, generates embeddings via LiteLLM, stores both.
Dedup via SHA-256 content hash — returns existing doc if duplicate.
Fail-open: if embedding generation fails, document stored with `chunkCount: 0`.

**Request body:**
```json
{
  "title": "Job Description Template",
  "content": "Full text content to be chunked and embedded...",
  "sourceUrl": "https://example.com/jd.pdf",
  "mimeType": "text/plain",
  "modelId": "text-embedding-3-small",
  "validUntil": "2026-06-01T00:00:00Z",
  "metadata": { "department": "engineering" }
}
```

**Response** `201`:
```json
{
  "document": { "id": "uuid", "title": "...", "chunkCount": 4, "..." },
  "chunksCreated": 4,
  "embeddingsGenerated": true
}
```

**Response** `200` (duplicate):
```json
{ "duplicate": true, "document": { "..." } }
```

---

### `GET /api/documents?limit=20&offset=0`

List ingested documents, ordered by ingestion date descending.

**Query params:**
- `limit` — max 100, default 20
- `offset` — default 0

**Response** `200`: Array of document rows.

---

### `GET /api/documents/:id`

Get single document metadata.

**Path params:**
- `id` — Document UUID

**Response** `200`: Document row.

**Response** `404`:
```json
{ "error": "Document not found: <id>" }
```

---

### `GET /api/embeddings/search?q=...&limit=10&modelId=...`

Semantic search via pgvector cosine similarity.
§19 HARD GATE: `modelId` is **required** — never mix vectors from different models.

**Query params:**
- `q` — Search query (required)
- `modelId` — Embedding model ID (required)
- `limit` — max 50, default 10

**Response** `200`:
```json
[
  {
    "id": "uuid",
    "source_type": "document",
    "source_id": "doc-uuid",
    "metadata": { "chunkIndex": 0, "documentTitle": "..." },
    "similarity": 0.87
  }
]
```

**Response** `400`:
```json
{ "error": "Required query param: modelId (§19 HARD GATE: never mix vectors from different models)" }
```

**Response** `502`:
```json
{ "error": "Failed to generate query embedding — LiteLLM proxy may be unavailable" }
```

---

### `POST /api/embeddings`

Direct embedding insertion (for pre-computed embeddings).

**Request body:**
```json
{
  "sourceType": "document",
  "sourceId": "doc-uuid",
  "contentHash": "sha256...",
  "embedding": [0.1, 0.2, ...],
  "modelId": "text-embedding-3-small",
  "metadata": { "chunkIndex": 0 }
}
```

**Response** `201`: The created embedding row.

---

### `POST /api/documents/upload`

Binary document upload (PDF, DOCX, TXT, Markdown). Uses Unstructured.io for parsing.

**Headers:**
- `Content-Type` — MIME type (`application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/markdown`)
- `x-document-title` — Document title (optional, defaults to "Untitled")

**Body:** Raw binary content (not JSON).

**Response** `201`:
```json
{
  "document": { "id": "uuid", "title": "...", "chunkCount": 4 },
  "chunksCreated": 4,
  "embeddingsGenerated": true,
  "parsedPageCount": 12
}
```

**Response** `400`: `{ "error": "Unsupported Content-Type: ..." }`
**Response** `502`: `{ "error": "Document parsing failed — Unstructured.io may be unavailable" }`

---

### `POST /api/transcribe`

Transcribe audio via Deepgram. Requires `DEEPGRAM_API_KEY` env var.

**Headers:**
- `Content-Type` — Audio MIME type (e.g., `audio/wav`, `audio/mp3`). Defaults to `audio/wav`.

**Body:** Raw audio binary.

**Response** `200`:
```json
{
  "text": "The transcribed text...",
  "confidence": 0.95,
  "durationSeconds": 12.5
}
```

**Response** `400`: `{ "error": "Empty audio body" }`
**Response** `502`: `{ "error": "Transcription unavailable — DEEPGRAM_API_KEY may not be set" }`

---

### `GET /api/preferences/:userId`

Get all preferences for a user.

**Response** `200`: Array of preference rows.

---

### `POST /api/preferences/:userId`

Set an explicit preference. Upserts if key already exists.

**Request body:**
```json
{
  "preferenceKey": "preferred_model",
  "preferenceValue": "claude-haiku"
}
```

**Response** `201`: Created preference row.
**Response** `200`: Updated preference row (if key existed).

---

### `PATCH /api/preferences/:userId/:key`

Update a preference value.

**Request body:**
```json
{ "preferenceValue": "gpt-4o-mini" }
```

**Response** `200`: Updated preference row.
**Response** `404`: `{ "error": "Preference not found: <key>" }`

---

### `DELETE /api/preferences/:userId/:key`

Delete a preference.

**Response** `200`: `{ "deleted": "<key>" }`
**Response** `404`: `{ "error": "Preference not found: <key>" }`

---

### `POST /api/preferences/:userId/infer`

Trigger preference inference from feedback history. Queries last 100 generations with feedback and applies rule-based pattern matching.

**Response** `200`:
```json
{
  "inferred": 3,
  "preferences": [
    { "preferenceKey": "preferred_model", "preferenceValue": "claude-haiku", "confidence": 0.7 }
  ]
}
```

---

### `GET /api/few-shot?taskType=...&limit=5`

Get active few-shot examples for a task type, ordered by quality score.

**Query params:**
- `taskType` — required
- `limit` — max 20, default 5

**Response** `200`: Array of few-shot bank rows.
**Response** `400`: `{ "error": "Required query param: taskType" }`

---

### `POST /api/few-shot`

Manually add a few-shot example.

**Request body:**
```json
{
  "taskType": "classification",
  "inputText": "Classify this job posting...",
  "outputText": "Software Engineering",
  "qualityScore": 0.95,
  "metadata": {}
}
```

**Response** `201`: Created few-shot row.

---

### `POST /api/few-shot/build`

Auto-curate few-shot examples from top-scoring generations (qualityScore >= threshold AND thumbs >= 1).

**Request body:**
```json
{
  "taskType": "classification",
  "minQualityScore": 0.85,
  "limit": 20
}
```

**Response** `200`:
```json
{
  "taskType": "classification",
  "candidatesFound": 15,
  "added": 8
}
```

---

### `DELETE /api/few-shot/:id`

Soft-delete a few-shot example (sets `isActive=false`).

**Response** `200`: `{ "deactivated": "<id>" }`
**Response** `404`: `{ "error": "Few-shot example not found: <id>" }`

---

### `GET /api/moat-health`

Moat health dashboard — aggregated flywheel velocity, quality metrics,
few-shot coverage, outcome funnel, and prompt health.

**Response** `200`:
```json
{
  "flywheelVelocity": {
    "generationsPerDay": 14.3,
    "totalGenerations": 100,
    "feedbackRatePct": 45.0
  },
  "quality": {
    "avgQualityScore": 0.82,
    "hallucinationRatePct": 5.2,
    "thumbsUp": 80,
    "thumbsDown": 12
  },
  "fewShotCoverage": [
    { "taskType": "classification", "active": 10, "auto": 7, "manual": 3 }
  ],
  "outcomeFunnel": {
    "totalGenerations": 100,
    "withFeedback": 45,
    "conversions": 20,
    "abandoned": 5
  },
  "promptHealth": [
    { "promptName": "job-classifier", "version": "v1.2.0", "evalScore": "0.85", "activePct": 100 }
  ]
}
```

---

## Cost Budget Guard

Cost budget enforcement on `/api/chat*`, `/api/generate*`, `/api/documents*`, and `/api/embeddings*` routes (after rate limiter):

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

Token-based rate limiting on `/api/chat*`, `/api/generate*`, `/api/documents*`, and `/api/embeddings*` routes:

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

---

## Unified Ingestion (§19)

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/ingest | Ingest content of any supported MIME type |
| GET | /api/ingest/types | List supported MIME types |

### POST /api/ingest

Accepts raw content with appropriate `Content-Type` header. Dispatches to the correct adapter via IngesterRegistry.

**Request:**
- `Content-Type`: The MIME type of the content being ingested (e.g., `text/plain`, `text/csv`, `audio/wav`, `image/png`, `text/x-uri`, `application/x-api-feed`)
- Body: Raw content bytes

**Response (201):**
```json
{
  "text": "First 500 characters of extracted text...",
  "sourceType": "document",
  "mimeType": "text/plain",
  "contentHash": "sha256-hex-string",
  "metadata": {},
  "textLength": 1234
}
```

**Error (422):**
```json
{
  "error": "Unsupported or failed ingestion for Content-Type: video/mp4",
  "supportedTypes": ["text/plain", "text/csv", "application/pdf", ...]
}
```

### GET /api/ingest/types

Returns list of currently supported MIME types.

**Response (200):**
```json
{
  "supportedTypes": ["text/plain", "text/markdown", "text/csv", "application/pdf", "image/png", "image/jpeg", "audio/wav", "audio/mp3", ...]
}
```
