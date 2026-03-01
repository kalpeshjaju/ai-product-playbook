/**
 * FILE PURPOSE: Admin prompts page — list all prompts with management actions
 *
 * WHY: Admins need to view, create, and manage prompt versions and traffic allocation.
 * HOW: Server component lists known prompts; PromptManager handles interactive actions.
 */

import type { PromptVersion } from '@playbook/shared-types';
import { PromptManager } from './prompt-manager';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

const PROMPT_NAMES = ['job-classifier', 'resume-parser', 'synthesis'];

async function getActivePrompts(): Promise<Record<string, PromptVersion | null>> {
  const result: Record<string, PromptVersion | null> = {};
  for (const name of PROMPT_NAMES) {
    try {
      const res = await fetch(`${API_URL}/api/prompts/${name}/active`, { cache: 'no-store' });
      result[name] = res.ok ? (await res.json() as PromptVersion) : null;
    } catch {
      result[name] = null;
    }
  }
  return result;
}

export default async function AdminPromptsPage() {
  const prompts = await getActivePrompts();

  return (
    <div>
      <h1 className="text-2xl font-bold">Prompt Management</h1>
      <p className="mt-1 text-gray-500">Create, allocate traffic, and promote prompt versions.</p>

      <div className="mt-6 space-y-4">
        {PROMPT_NAMES.map((name) => {
          const version = prompts[name];
          return (
            <div key={name} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{name}</span>
                {version ? (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {version.version} — {version.active_pct}% traffic
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">No active version</span>
                )}
              </div>
              {version && (
                <p className="mt-1 text-xs text-gray-400">
                  Eval: {version.eval_score ?? 'N/A'} | Hash: {version.content_hash.slice(0, 8)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <PromptManager apiUrl={API_URL} />
    </div>
  );
}
