/**
 * FILE PURPOSE: Client component for interactive prompt management
 *
 * WHY: Creating prompts, adjusting traffic, and promoting require user interaction
 *      and form state that server components can't handle.
 * HOW: Forms call POST/PATCH API endpoints; results shown inline.
 */

'use client';

import { useState } from 'react';
import { trackEvent } from '../../hooks/use-analytics';

interface PromptManagerProps {
  apiUrl: string;
}

export function PromptManager({ apiUrl }: PromptManagerProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch(`${apiUrl}/api/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_name: data.get('prompt_name'),
          content: data.get('content'),
          author: data.get('author'),
        }),
      });
      const json = await res.json() as Record<string, unknown>;
      if (res.ok) {
        setMessage(`Created ${json.promptName as string} ${json.version as string}`);
        trackEvent('prompt_created', { promptName: json.promptName as string, version: json.version as string });
        form.reset();
      } else {
        setMessage(`Error: ${json.error as string}`);
      }
    } catch {
      setMessage('Error: Could not reach API');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTraffic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    const data = new FormData(e.currentTarget);

    try {
      const res = await fetch(`${apiUrl}/api/prompts/${data.get('id')}/traffic`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_pct: Number(data.get('active_pct')) }),
      });
      const json = await res.json() as Record<string, unknown>;
      if (res.ok) {
        setMessage(`Traffic updated to ${json.activePct as number}%`);
      } else {
        setMessage(`Error: ${json.error as string}`);
      }
    } catch {
      setMessage('Error: Could not reach API');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePromote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    const data = new FormData(e.currentTarget);

    try {
      const res = await fetch(`${apiUrl}/api/prompts/${data.get('name')}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: data.get('version') }),
      });
      const json = await res.json() as Record<string, unknown>;
      if (res.ok) {
        setMessage(`Promoted to ${json.newPct as number}%. ${json.nextStep as string}`);
        trackEvent('prompt_promoted', { promptName: data.get('name') as string, version: data.get('version') as string, newPct: json.newPct as number });
      } else {
        setMessage(`Error: ${json.error as string}`);
      }
    } catch {
      setMessage('Error: Could not reach API');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <h2 className="text-lg font-semibold">Actions</h2>

      {message && (
        <p className={`rounded p-2 text-sm ${message.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message}
        </p>
      )}

      {/* Create Prompt */}
      <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium">Create Prompt Version</h3>
        <div className="grid grid-cols-3 gap-3">
          <input name="prompt_name" placeholder="Prompt name" required
            className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
          <input name="author" placeholder="Author" required
            className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
          <button type="submit" disabled={isSubmitting}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Create
          </button>
        </div>
        <textarea name="content" placeholder="Prompt content" required rows={3}
          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
      </form>

      {/* Adjust Traffic */}
      <form onSubmit={handleTraffic} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium">Adjust Traffic</h3>
        <div className="grid grid-cols-3 gap-3">
          <input name="id" placeholder="Version ID" required
            className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
          <input name="active_pct" type="number" min={0} max={100} placeholder="Traffic %" required
            className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
          <button type="submit" disabled={isSubmitting}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Update
          </button>
        </div>
      </form>

      {/* Promote */}
      <form onSubmit={handlePromote} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium">Promote Version</h3>
        <div className="grid grid-cols-3 gap-3">
          <input name="name" placeholder="Prompt name" required
            className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
          <input name="version" placeholder="Version (e.g. v1.2.0)" required
            className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
          <button type="submit" disabled={isSubmitting}
            className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            Promote
          </button>
        </div>
      </form>
    </div>
  );
}
