/**
 * FILE PURPOSE: OpenPipe API routes — expose fine-tuning pipeline via HTTP
 *
 * WHY: Tier 2 tooling — lets external clients log training data, trigger
 *      fine-tune jobs, and check job status through the API server.
 * HOW: Delegates to logTrainingData(), triggerFineTune(), getFineTuneStatus()
 *      from shared-llm. Provider policy controls unavailability behavior:
 *      open mode => enabled:false response, strict mode => 503.
 *
 * Routes:
 *   POST /api/openpipe/log             — log training data entry
 *   POST /api/openpipe/finetune        — trigger fine-tune job
 *   GET  /api/openpipe/finetune/:jobId — get fine-tune status
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-02
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logTrainingData, triggerFineTune, getFineTuneStatus } from '@playbook/shared-llm';
import { enforceProviderAvailability, getStrategyProviderMode, getProviderUnavailableMessage } from '../middleware/provider-policy.js';
import type { TrainingEntry } from '@playbook/shared-llm';
import type { BodyParser } from '../types.js';

export async function handleOpenPipeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  const providerAvailable = enforceProviderAvailability('openpipe', res);
  if (!providerAvailable) {
    if (res.writableEnded) return;
    res.end(JSON.stringify({
      enabled: false,
      provider: 'openpipe',
      mode: getStrategyProviderMode(),
      message: getProviderUnavailableMessage('openpipe'),
    }));
    return;
  }

  // POST /api/openpipe/log — log training data
  if (url === '/api/openpipe/log' && req.method === 'POST') {
    const body = await parseBody(req);
    const messages = body.messages as TrainingEntry['messages'] | undefined;
    if (!messages || !Array.isArray(messages)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: messages (array)' }));
      return;
    }
    await logTrainingData({
      messages,
      idealOutput: body.idealOutput as string | undefined,
      tags: body.tags as Record<string, string> | undefined,
    });
    res.statusCode = 201;
    res.end(JSON.stringify({ logged: true }));
    return;
  }

  // POST /api/openpipe/finetune — trigger fine-tune
  if (url === '/api/openpipe/finetune' && req.method === 'POST') {
    const body = await parseBody(req);
    const baseModel = body.baseModel as string | undefined;
    if (!baseModel) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: baseModel' }));
      return;
    }
    const jobId = await triggerFineTune({
      baseModel,
      datasetFilters: body.datasetFilters as Record<string, string> | undefined,
      suffix: body.suffix as string | undefined,
    });
    if (!jobId) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Fine-tune job creation failed' }));
      return;
    }
    res.statusCode = 201;
    res.end(JSON.stringify({ jobId }));
    return;
  }

  // GET /api/openpipe/finetune/:jobId — get status
  const statusMatch = url.match(/^\/api\/openpipe\/finetune\/([^/?]+)$/);
  if (statusMatch && req.method === 'GET') {
    const jobId = statusMatch[1]!;
    const status = await getFineTuneStatus(jobId);
    if (!status) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Job not found' }));
      return;
    }
    res.end(JSON.stringify(status));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
}
