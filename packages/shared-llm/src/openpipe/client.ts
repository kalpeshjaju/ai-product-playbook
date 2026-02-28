/**
 * FILE PURPOSE: OpenPipe SDK integration for production fine-tuning pipeline
 *
 * WHY: Playbook §20 — capture high-quality production traffic as training data,
 *      then trigger fine-tuning jobs to create specialized models that are
 *      faster and cheaper than the base models.
 * HOW: Wraps the openpipe SDK. Logs training examples from production calls,
 *      triggers fine-tune jobs, and checks status. No-op when key not set.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

/** Training data entry for fine-tuning. */
export interface TrainingEntry {
  /** The messages sent to the model */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** The expected/ideal output */
  idealOutput?: string;
  /** Tags for filtering training data (e.g., task type, quality tier) */
  tags?: Record<string, string>;
}

/** Fine-tune job status. */
export interface FineTuneStatus {
  id: string;
  status: 'pending' | 'training' | 'completed' | 'failed';
  baseModel: string;
  trainedModel?: string;
  metrics?: {
    trainingLoss?: number;
    validationLoss?: number;
    epochs?: number;
  };
  createdAt: string;
  completedAt?: string;
}

let openPipeClient: unknown;
let initialized = false;

/**
 * Create and cache the OpenPipe client. Idempotent.
 * No-op when OPENPIPE_API_KEY not set.
 */
export function createOpenPipeClient(): void {
  if (initialized) return;
  initialized = true;

  const apiKey = process.env.OPENPIPE_API_KEY;
  if (!apiKey) {
    process.stderr.write('INFO: OPENPIPE_API_KEY not set — OpenPipe fine-tuning disabled\n');
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OpenPipe } = require('openpipe') as { OpenPipe: new (opts: { apiKey: string }) => unknown };
    openPipeClient = new OpenPipe({ apiKey });
  } catch {
    process.stderr.write('WARN: Failed to initialize openpipe — is the package installed?\n');
  }
}

/**
 * Log a training data entry from production traffic.
 * Use this to capture high-quality interactions for fine-tuning.
 * No-op when OpenPipe is disabled.
 */
export async function logTrainingData(entry: TrainingEntry): Promise<void> {
  createOpenPipeClient();
  if (!openPipeClient) return;

  try {
    const client = openPipeClient as {
      report: (opts: {
        requestedAt: number;
        receivedAt: number;
        reqPayload: { messages: TrainingEntry['messages'] };
        respPayload?: { choices: Array<{ message: { content: string } }> };
        tags?: Record<string, string>;
      }) => Promise<void>;
    };
    await client.report({
      requestedAt: Date.now(),
      receivedAt: Date.now(),
      reqPayload: { messages: entry.messages },
      respPayload: entry.idealOutput
        ? { choices: [{ message: { content: entry.idealOutput } }] }
        : undefined,
      tags: entry.tags,
    });
  } catch (err) {
    process.stderr.write(`WARN: OpenPipe logTrainingData failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

/**
 * Trigger a fine-tuning job.
 * Returns the job ID or null if OpenPipe is disabled.
 */
export async function triggerFineTune(config: {
  baseModel: string;
  datasetFilters?: Record<string, string>;
  suffix?: string;
}): Promise<string | null> {
  createOpenPipeClient();
  if (!openPipeClient) return null;

  try {
    const client = openPipeClient as {
      fineTune: {
        create: (opts: {
          baseModel: string;
          filters?: Record<string, string>;
          suffix?: string;
        }) => Promise<{ id: string }>;
      };
    };
    const result = await client.fineTune.create({
      baseModel: config.baseModel,
      filters: config.datasetFilters,
      suffix: config.suffix,
    });
    return result.id;
  } catch (err) {
    process.stderr.write(`WARN: OpenPipe triggerFineTune failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }
}

/**
 * Get the status of a fine-tuning job.
 * Returns null if OpenPipe is disabled or job not found.
 */
export async function getFineTuneStatus(jobId: string): Promise<FineTuneStatus | null> {
  createOpenPipeClient();
  if (!openPipeClient) return null;

  try {
    const client = openPipeClient as {
      fineTune: {
        get: (id: string) => Promise<{
          id: string;
          status: string;
          baseModel: string;
          trainedModel?: string;
          metrics?: Record<string, number>;
          createdAt: string;
          completedAt?: string;
        }>;
      };
    };
    const job = await client.fineTune.get(jobId);
    return {
      id: job.id,
      status: job.status as FineTuneStatus['status'],
      baseModel: job.baseModel,
      trainedModel: job.trainedModel,
      metrics: job.metrics ? {
        trainingLoss: job.metrics.training_loss,
        validationLoss: job.metrics.validation_loss,
        epochs: job.metrics.epochs,
      } : undefined,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  } catch (err) {
    process.stderr.write(`WARN: OpenPipe getFineTuneStatus failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }
}
