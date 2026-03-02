/**
 * FILE PURPOSE: Scheduled strategy flywheel runner
 *
 * WHY: Strategy pillar (§20–§22) requires regular feedback-loop execution:
 *      few-shot refresh, preference inference, and moat-health snapshots.
 *
 * HOW: Calls API endpoints with admin credentials, writes a JSON report,
 *      and fails when any loop operation fails.
 *
 * USAGE:
 *   npx tsx scripts/run-strategy-flywheel.ts
 *   DRY_RUN=true npx tsx scripts/run-strategy-flywheel.ts
 *
 * AUTHOR: Codex (GPT-5)
 * LAST UPDATED: 2026-03-02
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

interface OperationResult {
  name: string;
  ok: boolean;
  statusCode: number;
  details: unknown;
}

interface FlywheelReport {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  moatHealth: OperationResult;
  fewShotBuilds: OperationResult[];
  preferenceInference: OperationResult[];
  failures: number;
}

interface RequestInput {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

async function requestJson(input: RequestInput): Promise<{ ok: boolean; statusCode: number; body: unknown }> {
  const response = await fetch(input.url, {
    method: input.method,
    headers: input.headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  const text = await response.text();
  let body: unknown = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  return {
    ok: response.ok,
    statusCode: response.status,
    body,
  };
}

async function run(): Promise<void> {
  const dryRun = process.env.DRY_RUN === 'true';

  const apiUrl = process.env.API_URL?.trim() ?? '';
  const apiKey = process.env.API_KEY?.trim() ?? '';
  const adminKey = process.env.ADMIN_API_KEY?.trim() ?? '';

  if (!dryRun && (!apiUrl || !apiKey || !adminKey)) {
    throw new Error('Required env vars missing: API_URL, API_KEY, ADMIN_API_KEY');
  }

  const taskTypes = parseCsvEnv(process.env.FLYWHEEL_TASK_TYPES);
  const userIds = parseCsvEnv(process.env.FLYWHEEL_USER_IDS);
  const minQualityScore = envNumber('FLYWHEEL_MIN_QUALITY_SCORE', 0.85);
  const buildLimit = envNumber('FLYWHEEL_BUILD_LIMIT', 20);
  const inferAllLimit = envNumber('FLYWHEEL_INFER_ALL_LIMIT', 100);
  const inferMinFeedbackCount = envNumber('FLYWHEEL_INFER_MIN_FEEDBACK_COUNT', 3);

  const reportPath = resolve(process.env.FLYWHEEL_REPORT_PATH?.trim() || 'strategy-flywheel-report.json');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'x-admin-key': adminKey,
  };

  const startedAt = new Date().toISOString();
  const moatHealthResult: OperationResult = {
    name: 'moat-health',
    ok: true,
    statusCode: 0,
    details: dryRun ? { skipped: true } : null,
  };

  if (!dryRun) {
    const result = await requestJson({
      url: `${apiUrl}/api/moat-health`,
      method: 'GET',
      headers,
    });

    moatHealthResult.ok = result.ok;
    moatHealthResult.statusCode = result.statusCode;
    moatHealthResult.details = result.body;
  }

  const fewShotBuilds: OperationResult[] = [];
  for (const taskType of taskTypes) {
    if (dryRun) {
      fewShotBuilds.push({
        name: `few-shot-build:${taskType}`,
        ok: true,
        statusCode: 0,
        details: {
          skipped: true,
          payload: {
            taskType,
            minQualityScore,
            limit: buildLimit,
          },
        },
      });
      continue;
    }

    const result = await requestJson({
      url: `${apiUrl}/api/few-shot/build`,
      method: 'POST',
      headers,
      body: {
        taskType,
        minQualityScore,
        limit: buildLimit,
      },
    });

    fewShotBuilds.push({
      name: `few-shot-build:${taskType}`,
      ok: result.ok,
      statusCode: result.statusCode,
      details: result.body,
    });
  }

  const preferenceInference: OperationResult[] = [];
  if (userIds.length === 0) {
    if (dryRun) {
      preferenceInference.push({
        name: 'preferences-infer-all',
        ok: true,
        statusCode: 0,
        details: {
          skipped: true,
          payload: {
            limitUsers: inferAllLimit,
            minFeedbackCount: inferMinFeedbackCount,
          },
        },
      });
    } else {
      const result = await requestJson({
        url: `${apiUrl}/api/preferences/infer-all`,
        method: 'POST',
        headers,
        body: {
          limitUsers: inferAllLimit,
          minFeedbackCount: inferMinFeedbackCount,
        },
      });

      preferenceInference.push({
        name: 'preferences-infer-all',
        ok: result.ok,
        statusCode: result.statusCode,
        details: result.body,
      });
    }
  } else {
    for (const userId of userIds) {
      if (dryRun) {
        preferenceInference.push({
          name: `preferences-infer:${userId}`,
          ok: true,
          statusCode: 0,
          details: { skipped: true },
        });
        continue;
      }

      const result = await requestJson({
        url: `${apiUrl}/api/preferences/${encodeURIComponent(userId)}/infer`,
        method: 'POST',
        headers,
      });

      preferenceInference.push({
        name: `preferences-infer:${userId}`,
        ok: result.ok,
        statusCode: result.statusCode,
        details: result.body,
      });
    }
  }

  const failures = [
    moatHealthResult,
    ...fewShotBuilds,
    ...preferenceInference,
  ].filter((result) => !result.ok).length;

  const report: FlywheelReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun,
    moatHealth: moatHealthResult,
    fewShotBuilds,
    preferenceInference,
    failures,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  process.stdout.write(`Strategy flywheel report written: ${reportPath}\n`);
  process.stdout.write(`moat-health ok=${moatHealthResult.ok}\n`);
  process.stdout.write(`few-shot builds=${fewShotBuilds.length}, preference infers=${preferenceInference.length}\n`);

  if (failures > 0) {
    throw new Error(`Strategy flywheel failed with ${failures} failed operation(s)`);
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
});
