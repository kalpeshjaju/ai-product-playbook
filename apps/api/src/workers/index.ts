/**
 * FILE PURPOSE: Worker processors barrel — builds the processors map for BullMQ worker
 * WHY: Centralizes all processor imports so the worker entry point gets a single map.
 */

import type { JobProcessor } from '@playbook/shared-llm';
import { JobType } from '@playbook/shared-llm';
import { processEmbed } from './embed-processor.js';
import { processEnrich } from './enrich-processor.js';
import { processDedupCheck } from './dedup-processor.js';
import { processReEmbed } from './re-embed-processor.js';
import { processFreshness } from './freshness-processor.js';
import { processScrape } from './scrape-processor.js';

/** Build the complete processors map for createIngestionWorker(). */
export function buildProcessors(): Record<string, JobProcessor> {
  return {
    [JobType.EMBED]: processEmbed,
    [JobType.ENRICH]: processEnrich,
    [JobType.DEDUP_CHECK]: processDedupCheck,
    [JobType.RE_EMBED]: processReEmbed,
    [JobType.FRESHNESS]: processFreshness,
    [JobType.SCRAPE]: processScrape,
  };
}
