/**
 * FILE PURPOSE: Moat health dashboard — flywheel velocity, quality, few-shot, outcomes, prompts
 *
 * WHY: Playbook §22 prescribes a moat health dashboard to visualize
 *      how the data flywheel (generate → feedback → curate → improve) is performing.
 * HOW: Server component fetches GET /api/moat-health and renders 5 dashboard sections.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-02
 */

import { DataCard } from '@playbook/shared-ui';
import { API_URL, getApiHeaders } from '../../lib/api';

interface FewShotRow {
  taskType: string;
  active: number;
  auto: number;
  manual: number;
}

interface PromptRow {
  promptName: string;
  version: string;
  evalScore: string | null;
  activePct: number;
}

interface MoatHealth {
  flywheelVelocity: {
    generationsPerDay: number;
    totalGenerations: number;
    feedbackRatePct: number;
  };
  quality: {
    avgQualityScore: number | null;
    hallucinationRatePct: number;
    thumbsUp: number;
    thumbsDown: number;
  };
  fewShotCoverage: FewShotRow[];
  outcomeFunnel: {
    totalGenerations: number;
    withFeedback: number;
    conversions: number;
    abandoned: number;
  };
  promptHealth: PromptRow[];
}

async function getMoatHealth(): Promise<MoatHealth | null> {
  try {
    const res = await fetch(`${API_URL}/api/moat-health`, {
      cache: 'no-store',
      headers: getApiHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as MoatHealth;
  } catch {
    return null;
  }
}

export default async function MoatHealthPage() {
  const data = await getMoatHealth();

  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Moat Health</h1>
        <p className="mt-4 text-sm text-gray-400">
          Could not load moat health data. Ensure the API server is running at {API_URL}.
        </p>
      </div>
    );
  }

  const { flywheelVelocity, quality, fewShotCoverage, outcomeFunnel, promptHealth } = data;

  return (
    <div>
      <h1 className="text-2xl font-bold">Moat Health Dashboard</h1>
      <p className="mt-1 text-gray-500">
        Flywheel metrics from §22 — generate, feedback, curate, improve.
      </p>

      {/* ── 1. Flywheel Velocity ─────────────────────────────────────── */}
      <h2 className="mt-8 text-lg font-semibold">Flywheel Velocity</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <DataCard title="Generations / Day" value={flywheelVelocity.generationsPerDay} />
        <DataCard title="Total Generations" value={flywheelVelocity.totalGenerations} />
        <DataCard title="Feedback Rate" value={`${flywheelVelocity.feedbackRatePct}%`} />
      </div>

      {/* ── 2. Quality Metrics ───────────────────────────────────────── */}
      <h2 className="mt-8 text-lg font-semibold">Quality Metrics</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DataCard
          title="Avg Quality"
          value={quality.avgQualityScore !== null ? quality.avgQualityScore.toFixed(2) : 'N/A'}
        />
        <DataCard title="Hallucination Rate" value={`${quality.hallucinationRatePct}%`} />
        <DataCard title="Thumbs Up" value={quality.thumbsUp} />
        <DataCard title="Thumbs Down" value={quality.thumbsDown} />
      </div>

      {/* ── 3. Few-Shot Coverage ─────────────────────────────────────── */}
      <h2 className="mt-8 text-lg font-semibold">Few-Shot Coverage</h2>
      {fewShotCoverage.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">No active few-shot examples yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="pb-2 pr-4 font-medium">Task Type</th>
                <th className="pb-2 pr-4 font-medium">Active</th>
                <th className="pb-2 pr-4 font-medium">Auto</th>
                <th className="pb-2 font-medium">Manual</th>
              </tr>
            </thead>
            <tbody>
              {fewShotCoverage.map((row) => (
                <tr key={row.taskType} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium">{row.taskType}</td>
                  <td className="py-2 pr-4">{row.active}</td>
                  <td className="py-2 pr-4">{row.auto}</td>
                  <td className="py-2">{row.manual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 4. Outcome Funnel ────────────────────────────────────────── */}
      <h2 className="mt-8 text-lg font-semibold">Outcome Funnel</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DataCard title="Generations" value={outcomeFunnel.totalGenerations} />
        <DataCard title="With Feedback" value={outcomeFunnel.withFeedback} />
        <DataCard title="Conversions" value={outcomeFunnel.conversions} />
        <DataCard title="Abandoned" value={outcomeFunnel.abandoned} />
      </div>

      {/* ── 5. Prompt Health ─────────────────────────────────────────── */}
      <h2 className="mt-8 text-lg font-semibold">Prompt Health</h2>
      {promptHealth.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">No active prompts.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="pb-2 pr-4 font-medium">Prompt</th>
                <th className="pb-2 pr-4 font-medium">Version</th>
                <th className="pb-2 pr-4 font-medium">Eval Score</th>
                <th className="pb-2 font-medium">Traffic %</th>
              </tr>
            </thead>
            <tbody>
              {promptHealth.map((row) => (
                <tr key={`${row.promptName}-${row.version}`} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium">{row.promptName}</td>
                  <td className="py-2 pr-4">{row.version}</td>
                  <td className="py-2 pr-4">{row.evalScore ?? 'N/A'}</td>
                  <td className="py-2">{row.activePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
