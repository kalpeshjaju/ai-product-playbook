/**
 * FILE PURPOSE: Barrel export for all ingestion pipeline processors
 * WHY: Single import point for worker wiring and external consumers.
 */

export { processEmbed } from './embed.js';
export type { EmbedResult } from './embed.js';

export { processEnrich } from './enrich.js';
export type { EnrichResult, EnrichEntity } from './enrich.js';

export { processDedupCheck } from './dedup-check.js';
export type { DedupCheckResult, DedupCheckOptions } from './dedup-check.js';

export { processReEmbed } from './re-embed.js';
export type { ReEmbedResult, ReEmbedOptions } from './re-embed.js';

export { processFreshness } from './freshness.js';
export type { FreshnessResult, FreshnessDocInfo } from './freshness.js';

export { processScrape } from './scrape.js';
