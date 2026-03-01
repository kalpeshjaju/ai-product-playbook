/**
 * FILE PURPOSE: Prompts page — displays active prompt versions from API
 *
 * WHY: Users need visibility into which prompt versions are live and their traffic allocation.
 * HOW: Server component fetches GET /api/prompts/:name/active for known prompt names.
 */

import type { PromptVersion } from '@playbook/shared-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

const PROMPT_NAMES = ['job-classifier', 'resume-parser', 'synthesis'];

interface ActivePrompt {
  name: string;
  version: PromptVersion | null;
  error?: string;
}

async function getActivePrompts(): Promise<ActivePrompt[]> {
  const results: ActivePrompt[] = [];
  for (const name of PROMPT_NAMES) {
    try {
      const res = await fetch(`${API_URL}/api/prompts/${name}/active`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as PromptVersion;
        results.push({ name, version: data });
      } else {
        results.push({ name, version: null, error: `${res.status}` });
      }
    } catch {
      results.push({ name, version: null, error: 'unreachable' });
    }
  }
  return results;
}

export default async function PromptsPage() {
  const prompts = await getActivePrompts();

  return (
    <div>
      <h1 className="text-2xl font-bold">Prompts</h1>
      <p className="mt-1 text-gray-500">Active prompt versions and traffic allocation.</p>

      <div className="mt-6 space-y-4">
        {prompts.map((p) => (
          <div
            key={p.name}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{p.name}</span>
              {p.version ? (
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  {p.version.version}
                </span>
              ) : (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {p.error === 'unreachable' ? 'API offline' : 'No active version'}
                </span>
              )}
            </div>
            {p.version && (
              <div className="mt-2 grid grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <span className="text-gray-400">Traffic:</span>{' '}
                  {p.version.active_pct}%
                </div>
                <div>
                  <span className="text-gray-400">Eval Score:</span>{' '}
                  {p.version.eval_score ?? 'N/A'}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
