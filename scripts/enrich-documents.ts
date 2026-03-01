#!/usr/bin/env npx tsx
/**
 * FILE PURPOSE: Enrich documents with LLM-generated metadata
 *
 * WHY: INPUT pillar — adds summary, entities, and tags to documents
 *      that lack enrichment metadata. Improves RAG retrieval quality.
 *
 * USAGE: npx tsx scripts/enrich-documents.ts
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { eq, isNull, sql } from 'drizzle-orm';

async function main() {
  const { db, documents } = await import('../apps/api/src/db/index.js');
  const { createLLMClient } = await import('../packages/shared-llm/src/index.js');

  // Find documents without enrichment (metadata.enriched is not set)
  const unenriched = await db
    .select()
    .from(documents)
    .where(sql`metadata IS NULL OR metadata->>'enriched' IS NULL`)
    .limit(20);

  process.stdout.write(`Found ${unenriched.length} unenriched documents\n`);

  const client = createLLMClient();
  let enriched = 0;

  for (const doc of unenriched) {
    try {
      const response = await client.chat.completions.create({
        model: 'claude-haiku',
        messages: [
          {
            role: 'system',
            content: 'You extract structured metadata from documents. Return JSON only.',
          },
          {
            role: 'user',
            content: `Extract metadata from this document titled "${doc.title}" (${doc.mimeType}).
Content hash: ${doc.contentHash}
Chunk count: ${doc.chunkCount}

Return JSON with:
- summary: 1-2 sentence summary
- entities: array of key entities mentioned
- tags: array of 3-5 relevant tags
- category: one of [technical, business, legal, creative, reference, other]`,
          },
        ],
        max_tokens: 300,
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content) as Record<string, unknown>;
      } catch {
        // Try extracting JSON from markdown code block
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        parsed = match ? JSON.parse(match[1]!) as Record<string, unknown> : {};
      }

      const existingMetadata = (doc.metadata as Record<string, unknown>) ?? {};
      await db.update(documents)
        .set({
          metadata: {
            ...existingMetadata,
            ...parsed,
            enriched: true,
            enrichedAt: new Date().toISOString(),
          },
        })
        .where(eq(documents.id, doc.id));

      enriched++;
      process.stdout.write(`Enriched: ${doc.title}\n`);
    } catch (err) {
      process.stderr.write(`ERROR enriching ${doc.id}: ${err}\n`);
    }
  }

  process.stdout.write(`Done. Enriched: ${enriched}/${unenriched.length}\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
