export type { IngestResult, IngestOptions, Ingester, ChunkStrategy, SourceType } from './types.js';
export { computeContentHash } from './types.js';
export { IngesterRegistry } from './registry.js';
export { chunkFixed, chunkSlidingWindow, chunkPerEntity, chunkSemantic, selectChunker } from './chunking/index.js';
export { DocumentIngester } from './adapters/document.js';
export { AudioIngester } from './adapters/audio.js';
export { ImageIngester } from './adapters/image.js';
export { WebIngester } from './adapters/web.js';
export { CsvIngester } from './adapters/csv.js';
export { ApiFeedIngester } from './adapters/api-feed.js';
export { computeFreshnessMultiplier } from './freshness.js';
export { isHashDuplicate, cosineSimilarity, NEAR_DEDUP_THRESHOLD, matchEntity } from './dedup/index.js';
export type { NearDedupResult, EntityIdentifiers, ExistingEntity, EntityDedupResult } from './dedup/index.js';
export { createIngestionQueue, JobType } from './pipeline/queue.js';
export type { JobTypeValue } from './pipeline/queue.js';
export type {
  IngestionJobData,
  EmbedPayload,
  EnrichPayload,
  DedupCheckPayload,
  ExistingEmbedding,
  ReEmbedPayload,
  FreshnessPayload,
  ScrapePayload,
  IngestionPayload,
} from './pipeline/jobs.js';
export { createIngestionWorker, processIngestionJob } from './pipeline/workers.js';
export { parseRedisConnection } from './pipeline/connection.js';
export type { RedisConnectionOptions } from './pipeline/connection.js';
export {
  processEmbed,
  processEnrich,
  processDedupCheck,
  processReEmbed,
  processFreshness,
  processScrape,
} from './pipeline/processors/index.js';
export type {
  EmbedResult,
  EnrichResult,
  EnrichEntity,
  DedupCheckResult,
  DedupCheckOptions,
  ReEmbedResult,
  ReEmbedOptions,
  FreshnessResult,
  FreshnessDocInfo,
} from './pipeline/processors/index.js';
