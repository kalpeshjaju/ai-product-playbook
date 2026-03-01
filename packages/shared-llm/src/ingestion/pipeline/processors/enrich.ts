/**
 * FILE PURPOSE: ENRICH worker processor — extracts entities, topics, summary via LLM
 * WHY: §19 — enrichment graph runs as async jobs. Each step is idempotent.
 *      Partial enrichment is valid (§19: "index what you have, enrich later").
 */

import type { Job } from 'bullmq';
import type { IngestionJobData, EnrichPayload } from '../jobs.js';
import { createLLMClient } from '../../../llm-client.js';
import { costLedger } from '../../../cost-ledger.js';

export interface EnrichEntity {
  name: string;
  type: string;
}

export interface EnrichResult {
  documentId: string;
  entities: EnrichEntity[];
  topics: string[];
  summary: string;
}

const ENRICH_SYSTEM_PROMPT = `Extract structured metadata from the following content.
Return JSON with exactly these fields:
- entities: array of { name: string, type: string } (people, companies, technologies, places)
- topics: array of topic strings
- summary: one-sentence summary

Return ONLY valid JSON, no markdown fencing.`;

export async function processEnrich(job: Job<IngestionJobData>): Promise<EnrichResult> {
  const { documentId } = job.data;
  const payload = job.data.payload as EnrichPayload;
  const { content } = payload;

  if (!content || content.trim().length === 0) {
    await job.log(`Empty content for doc ${documentId} — returning empty enrichment`);
    return { documentId, entities: [], topics: [], summary: '' };
  }

  const startedAt = Date.now();
  const client = createLLMClient();

  const response = await client.chat.completions.create({
    model: 'claude-haiku',
    messages: [
      { role: 'system', content: ENRICH_SYSTEM_PROMPT },
      { role: 'user', content: content.slice(0, 8000) },
    ],
    temperature: 0,
  });

  const promptTokens = response.usage?.prompt_tokens ?? Math.ceil(content.length / 4);
  const completionTokens = response.usage?.completion_tokens ?? 0;

  costLedger.recordCall(
    'worker-enrich',
    'claude-haiku',
    promptTokens,
    completionTokens,
    Date.now() - startedAt,
    true,
  );

  const raw = response.choices[0]?.message?.content ?? '{}';
  let parsed: { entities?: EnrichEntity[]; topics?: string[]; summary?: string };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    await job.log(`WARN: Failed to parse enrichment JSON for doc ${documentId}`);
    return { documentId, entities: [], topics: [], summary: '' };
  }

  await job.log(`Enriched doc ${documentId}: ${parsed.entities?.length ?? 0} entities, ${parsed.topics?.length ?? 0} topics`);

  return {
    documentId,
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}
