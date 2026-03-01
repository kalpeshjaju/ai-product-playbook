-- Add HNSW index for fast cosine similarity search on embeddings.
-- Without this, pgvector falls back to sequential scan on large tables.
-- HNSW chosen over IVFFlat: no training step, better recall, self-tuning.
-- m=16, ef_construction=64 are pgvector defaults — good for <1M vectors.
CREATE INDEX "idx_embeddings_hnsw" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);
