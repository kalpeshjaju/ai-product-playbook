/**
 * FILE PURPOSE: Web app homepage — displays playbook entries from API
 *
 * WHY: Replaces hardcoded entries with live data from the API server.
 * HOW: Server component fetches GET /api/entries and renders a card list.
 */

import type { PlaybookEntry } from '@playbook/shared-types';
import { StatusBadge } from '@playbook/shared-ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

async function getEntries(): Promise<PlaybookEntry[]> {
  try {
    const res = await fetch(`${API_URL}/api/entries`, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json() as PlaybookEntry[];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const entries = await getEntries();

  return (
    <div>
      <h1 className="text-2xl font-bold">AI Product Playbook</h1>
      <p className="mt-1 text-gray-500">LLM-maintained patterns for production AI products.</p>

      {entries.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">
          No entries loaded. Ensure the API server is running at {API_URL}.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{e.title}</span>
                <StatusBadge status={e.status} />
              </div>
              <p className="mt-1 text-sm text-gray-500">{e.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
