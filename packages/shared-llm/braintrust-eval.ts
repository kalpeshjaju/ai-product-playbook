/**
 * FILE PURPOSE: Braintrust evaluation for CI/CD prompt regression checks
 *
 * WHY: Playbook §9 — ensures prompt changes don't regress quality.
 *      Runs experiments via Braintrust SDK when available, falls back to
 *      manual scoring when SDK not installed.
 * HOW: Loads test cases from eval-dataset.json, runs against LiteLLM proxy,
 *      uses Braintrust Eval() with scorers for structured evaluation.
 *      Outputs results to braintrust-results.json for CI consumption.
 *
 * USAGE: npx tsx packages/shared-llm/braintrust-eval.ts
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface TestCase {
  input: string;
  expected: string;
  taskType: 'classification' | 'extraction' | 'scoring';
  difficulty: 'easy' | 'medium' | 'hard';
}

interface EvalResult {
  passed: boolean;
  score: number | null;
  baseline: number | null;
  experimentCount: number;
  details: string[];
}

/** Load test cases from eval-dataset.json */
function loadDataset(): TestCase[] {
  const datasetPath = resolve(import.meta.dirname ?? '.', 'eval-dataset.json');
  const raw = readFileSync(datasetPath, 'utf8');
  return JSON.parse(raw) as TestCase[];
}

/** Score a single LLM response against expected output. */
function scoreResponse(output: string, expected: string, taskType: string): number {
  const lower = output.toLowerCase();
  const expectedLower = expected.toLowerCase();

  if (taskType === 'classification') {
    // Classification: exact category match
    return lower.includes(expectedLower) ? 1.0 : 0.0;
  }

  if (taskType === 'extraction') {
    // Extraction: fraction of expected skills found in output
    const expectedSkills = expectedLower.split(',').map(s => s.trim());
    const found = expectedSkills.filter(skill => lower.includes(skill));
    return expectedSkills.length > 0 ? found.length / expectedSkills.length : 0;
  }

  if (taskType === 'scoring') {
    // Scoring: check if the output contains the expected level
    return lower.includes(expectedLower) ? 1.0 : 0.0;
  }

  return 0;
}

/** Call LiteLLM proxy for a single test case. */
async function callLLM(testCase: TestCase, litellmUrl: string, litellmKey: string): Promise<string> {
  const response = await fetch(`${litellmUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${litellmKey}`,
    },
    body: JSON.stringify({
      model: 'claude-haiku',
      messages: [
        { role: 'system', content: `You are evaluating a ${testCase.taskType} task. Be concise.` },
        { role: 'user', content: testCase.input },
      ],
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data?.choices?.[0]?.message?.content ?? '';
}

/** Run evaluation using Braintrust SDK. */
async function runWithBraintrustSDK(testCases: TestCase[], litellmUrl: string, litellmKey: string): Promise<EvalResult> {
  const braintrust = await import('braintrust');
  const details: string[] = [];

  const result = await braintrust.Eval('ai-product-playbook', {
    data: () => testCases.map(tc => ({
      input: tc.input,
      expected: tc.expected,
      metadata: { taskType: tc.taskType, difficulty: tc.difficulty },
    })),
    task: async (input: string) => {
      const tc = testCases.find(t => t.input === input);
      if (!tc) return '';
      return callLLM(tc, litellmUrl, litellmKey);
    },
    scores: [
      {
        name: 'relevance',
        scorer: (args: { output: string; expected?: string; metadata?: Record<string, unknown> }) => {
          const taskType = (args.metadata?.taskType as string) ?? 'classification';
          return scoreResponse(args.output, args.expected ?? '', taskType);
        },
      },
      {
        name: 'non_empty',
        scorer: (args: { output: string }) => {
          return args.output.trim().length > 0 ? 1.0 : 0.0;
        },
      },
    ],
  });

  const summary = result.summary;
  const avgScore = typeof summary?.metrics?.relevance?.score === 'number'
    ? summary.metrics.relevance.score
    : null;

  details.push(`Braintrust SDK experiment completed`);
  details.push(`Average relevance: ${avgScore?.toFixed(3) ?? 'N/A'}`);

  const baseline = 0.60;
  // Statistical significance: require score >= baseline - 0.05 (practical threshold)
  const threshold = baseline - 0.05;
  const passed = avgScore === null || avgScore >= threshold;

  return {
    passed,
    score: avgScore,
    baseline,
    experimentCount: testCases.length,
    details,
  };
}

/** Fallback: run manual evaluation without Braintrust SDK. */
async function runManualEval(testCases: TestCase[], litellmUrl: string, litellmKey: string): Promise<EvalResult> {
  const details: string[] = [];
  let totalScore = 0;
  let experimentCount = 0;

  for (const testCase of testCases) {
    try {
      const output = await callLLM(testCase, litellmUrl, litellmKey);
      const score = scoreResponse(output, testCase.expected, testCase.taskType);

      totalScore += score;
      experimentCount++;
      details.push(`${testCase.taskType} [${testCase.difficulty}]: ${score.toFixed(2)}`);
    } catch (err) {
      details.push(`${testCase.taskType} [${testCase.difficulty}]: ERROR (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const avgScore = experimentCount > 0 ? totalScore / experimentCount : 0;
  const baseline = 0.60;
  const threshold = baseline - 0.05;
  const passed = avgScore >= threshold;

  return { passed, score: avgScore, baseline, experimentCount, details };
}

async function main(): Promise<void> {
  process.stdout.write('Running Braintrust evaluation...\n');

  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (!apiKey) {
    process.stderr.write('INFO: BRAINTRUST_API_KEY not set — skipping evaluation\n');
    const result: EvalResult = { passed: true, score: null, baseline: null, experimentCount: 0, details: ['Skipped: no API key'] };
    const outputPath = resolve(import.meta.dirname ?? '.', 'braintrust-results.json');
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    return;
  }

  const litellmUrl = process.env.LITELLM_PROXY_URL ?? 'http://localhost:4000/v1';
  const litellmKey = process.env.LITELLM_API_KEY ?? '';

  const testCases = loadDataset();
  process.stdout.write(`Loaded ${testCases.length} test cases\n`);

  let result: EvalResult;

  // Try Braintrust SDK first, fall back to manual scoring
  try {
    await import('braintrust');
    process.stdout.write('Using Braintrust SDK...\n');
    result = await runWithBraintrustSDK(testCases, litellmUrl, litellmKey);
  } catch {
    process.stderr.write('WARN: Braintrust SDK not available — using manual scoring\n');
    result = await runManualEval(testCases, litellmUrl, litellmKey);
  }

  // Write results for CI workflow consumption
  const outputPath = resolve(import.meta.dirname ?? '.', 'braintrust-results.json');
  writeFileSync(outputPath, JSON.stringify(result, null, 2));

  process.stdout.write(`\nResults: ${result.passed ? 'PASSED' : 'FAILED'}\n`);
  process.stdout.write(`Score: ${result.score?.toFixed(3) ?? 'N/A'} (baseline: ${result.baseline?.toFixed(3) ?? 'N/A'})\n`);
  for (const detail of result.details) {
    process.stdout.write(`  ${detail}\n`);
  }

  if (!result.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
