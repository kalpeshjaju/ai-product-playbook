#!/usr/bin/env npx tsx
/**
 * FILE PURPOSE: Re-embed stale documents whose validUntil has passed
 *
 * WHY: INPUT pillar — documents with expiring content need periodic refresh.
 *      If sourceUrl is set, re-fetches and re-embeds when content changes.
 *      If content unchanged, bumps validUntil by 30 days.
 *
 * USAGE: npx tsx scripts/reembed-stale-documents.ts
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { createHash } from 'node:crypto';
import { eq, lt, isNotNull, and } from 'drizzle-orm';

async function main() {
  // Dynamic import — avoids issues when db env vars not set at parse time
  const { db, documents, embeddings } = await import('../apps/api/src/db/index.js');
  const { createLLMClient } = await import('../packages/shared-llm/src/index.js');

  const now = new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const stale = await db
    .select()
    .from(documents)
    .where(and(
      isNotNull(documents.validUntil),
      lt(documents.validUntil, now),
      isNotNull(documents.sourceUrl),
    ))
    .limit(50);

  process.stdout.write(`Found ${stale.length} stale documents\n`);

  let refreshed = 0;
  let bumped = 0;

  for (const doc of stale) {
    try {
      const response = await fetch(doc.sourceUrl!);
      if (!response.ok) {
        process.stderr.write(`WARN: Could not fetch ${doc.sourceUrl}: ${response.status}\n`);
        continue;
      }

      const newContent = await response.text();
      const newHash = createHash('sha256').update(newContent).digest('hex');

      if (newHash === doc.contentHash) {
        // Content unchanged — bump validUntil
        await db.update(documents)
          .set({ validUntil: new Date(now.getTime() + thirtyDaysMs) })
          .where(eq(documents.id, doc.id));
        bumped++;
        continue;
      }

      // Content changed — re-embed
      const modelId = doc.embeddingModelId ?? 'text-embedding-3-small';
      const client = createLLMClient();

      // Chunk (simple 2000 char / 200 overlap)
      const chunks: string[] = [];
      let start = 0;
      while (start < newContent.length) {
        const end = Math.min(start + 2000, newContent.length);
        chunks.push(newContent.slice(start, end));
        if (end >= newContent.length) break;
        start = end - 200;
      }

      const embResponse = await client.embeddings.create({ model: modelId, input: chunks });
      const vectors = embResponse.data.map((d) => d.embedding);

      // Delete old embeddings for this document
      await db.delete(embeddings).where(eq(embeddings.sourceId, doc.id));

      // Insert new embeddings
      const embeddingRows = chunks.map((chunk, i) => ({
        sourceType: 'document' as const,
        sourceId: doc.id,
        contentHash: createHash('sha256').update(chunk).digest('hex'),
        embedding: vectors[i]!,
        modelId,
        metadata: { chunkIndex: i, documentTitle: doc.title },
      }));
      await db.insert(embeddings).values(embeddingRows);

      // Update document
      await db.update(documents)
        .set({
          contentHash: newHash,
          chunkCount: chunks.length,
          validUntil: new Date(now.getTime() + thirtyDaysMs),
        })
        .where(eq(documents.id, doc.id));

      refreshed++;
    } catch (err) {
      process.stderr.write(`ERROR processing ${doc.id}: ${err}\n`);
    }
  }

  process.stdout.write(`Done. Refreshed: ${refreshed}, Bumped: ${bumped}\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
