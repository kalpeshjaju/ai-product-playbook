/**
 * FILE PURPOSE: Admin costs dashboard — cost observability with reset capability
 *
 * WHY: Admins need the same cost visibility as users, plus ability to reset counters.
 * HOW: Server component fetches GET /api/costs; reset button calls proxy route handler.
 */

import { DataCard } from '@playbook/shared-ui';
import { CostReset } from './cost-reset';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

interface AgentCost {
  input: number;
  output: number;
  costUSD: number;
  model: string;
}

interface AgentDetail {
  callCount: number;
  successCount: number;
  failCount: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

interface CostReport {
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byAgent: Record<string, AgentCost>;
  byAgentDetailed: Record<string, AgentDetail>;
  totalCalls: number;
  totalFailures: number;
  overallErrorRate: number;
  overallAvgLatencyMs: number;
}

async function getCosts(): Promise<CostReport | null> {
  try {
    const res = await fetch(`${API_URL}/api/costs`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as CostReport;
  } catch {
    return null;
  }
}

export default async function AdminCostsPage() {
  const costs = await getCosts();

  if (!costs) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Costs</h1>
        <p className="mt-4 text-sm text-gray-400">
          Could not load cost data. Ensure the API server is running at {API_URL}.
        </p>
      </div>
    );
  }

  const agents = Object.keys(costs.byAgent);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cost Dashboard</h1>
        <CostReset />
      </div>
      <p className="mt-1 text-gray-500">LLM cost observability and per-agent breakdown.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DataCard title="Total Cost" value={`$${costs.totalCostUSD.toFixed(4)}`} />
        <DataCard title="Total Calls" value={costs.totalCalls} />
        <DataCard title="Error Rate" value={`${(costs.overallErrorRate * 100).toFixed(1)}%`} />
        <DataCard title="Avg Latency" value={`${Math.round(costs.overallAvgLatencyMs)}ms`} />
      </div>

      {agents.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Per-Agent Breakdown</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="pb-2 pr-4 font-medium">Agent</th>
                  <th className="pb-2 pr-4 font-medium">Model</th>
                  <th className="pb-2 pr-4 font-medium">Cost</th>
                  <th className="pb-2 pr-4 font-medium">Calls</th>
                  <th className="pb-2 pr-4 font-medium">Errors</th>
                  <th className="pb-2 font-medium">Avg Latency</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const cost = costs.byAgent[agent] as AgentCost | undefined;
                  const detail = costs.byAgentDetailed[agent] as AgentDetail | undefined;
                  if (!cost) return null;
                  return (
                    <tr key={agent} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium">{agent}</td>
                      <td className="py-2 pr-4 text-gray-500">{cost.model}</td>
                      <td className="py-2 pr-4">${cost.costUSD.toFixed(4)}</td>
                      <td className="py-2 pr-4">{detail?.callCount ?? '-'}</td>
                      <td className="py-2 pr-4">{detail?.failCount ?? '-'}</td>
                      <td className="py-2">{detail ? `${Math.round(detail.avgLatencyMs)}ms` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
