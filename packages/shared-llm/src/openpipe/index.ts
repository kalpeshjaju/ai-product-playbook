/**
 * FILE PURPOSE: Barrel export for OpenPipe fine-tuning pipeline
 *
 * WHY: Single import point for OpenPipe client and types.
 *      Import: `import { logTrainingData, triggerFineTune } from '@playbook/shared-llm'`
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

export {
  createOpenPipeClient,
  logTrainingData,
  triggerFineTune,
  getFineTuneStatus,
} from './client.js';
export type { TrainingEntry, FineTuneStatus } from './client.js';
