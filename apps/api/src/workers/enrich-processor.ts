/**
 * FILE PURPOSE: ENRICH processor — extracts entities, topics, summary via LLM
 * WHY: Raw documents need structured metadata for filtering, faceted search,
 *      and RAG context enrichment. Uses claude-haiku for cost efficiency.
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { IngestionJobData } from '@playbook/shared-llm';
import { createLLMClient, extractJson, costLedger } from '@playbook/shared-llm';
import { db, documents } from '../db/index.js';
import { estimateTokens } from '../services/document-persistence.js';
import { checkTokenBudget } from '../rate-limiter.js';

const ENRICHMENT_MODEL = 'claude-haiku';
const MAX_CONTENT_CHARS = 8000;

const EXTRACTION_PROMPT = `Extract structured metadata from this document. Return JSON only:
{
  "entities": ["list of named entities (people, companies, products)"],
  "topics": ["list of 3-5 topic tags"],
  "summary": "2-3 sentence summary",
  "language": "ISO 639-1 code (e.g. en, es, fr)"
}

Document:
`;

export async function processEnrich(job: Job<IngestionJobData>): Promise<void> {
  const { documentId } = job.data;

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw new Error(`ENRICH: Document not found: ${documentId}`);

  const rawText = doc.rawContent?.toString('utf-8') ?? '';
  if (rawText.length === 0) {
    process.stderr.write(`WARN: ENRICH: Document ${documentId} has no content, skipping\n`);
    return;
  }

  const truncated = rawText.slice(0, MAX_CONTENT_CHARS);
  const estimatedPromptTokens = estimateTokens(EXTRACTION_PROMPT.length + truncated.length);
  const budget = await checkTokenBudget('system:ingestion-worker', estimatedPromptTokens);
  if (!budget.allowed) {
    throw new Error(`ENRICH: Token budget exceeded for ${documentId}`);
  }
  const startedAt = Date.now();

  try {
    const client = createLLMClient();
    const response = await client.chat.completions.create({
      model: ENRICHMENT_MODEL,
      messages: [{ role: 'user', content: EXTRACTION_PROMPT + truncated }],
      temperature: 0,
      max_tokens: 1000,
    });

    const outputText = response.choices[0]?.message?.content ?? '';
    const inputTokens = response.usage?.prompt_tokens ?? estimatedPromptTokens;
    const outputTokens = response.usage?.completion_tokens ?? estimateTokens(outputText.length);
    costLedger.recordCall('worker-enrich', ENRICHMENT_MODEL, inputTokens, outputTokens, Date.now() - startedAt, true);

    const { data: enrichment } = extractJson(outputText);
    const existingMetadata = (doc.metadata ?? {}) as Record<string, unknown>;

    await db.update(documents).set({
      metadata: { ...existingMetadata, enrichment },
      enrichmentStatus: { status: 'complete', enrichedAt: new Date().toISOString() },
    }).where(eq(documents.id, documentId));

    process.stderr.write(`INFO: ENRICH: ${documentId} — metadata extracted\n`);
  } catch (err) {
    costLedger.recordCall('worker-enrich', ENRICHMENT_MODEL, 0, 0, Date.now() - startedAt, false);
    const existingMetadata = (doc.metadata ?? {}) as Record<string, unknown>;

    await db.update(documents).set({
      metadata: { ...existingMetadata, enrichment: { error: String(err) } },
      enrichmentStatus: { status: 'failed', error: String(err), failedAt: new Date().toISOString() },
    }).where(eq(documents.id, documentId));

    process.stderr.write(`WARN: ENRICH: ${documentId} — extraction failed: ${err}\n`);
  }
}
