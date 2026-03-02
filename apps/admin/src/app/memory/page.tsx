/**
 * FILE PURPOSE: Memory browser — view, search, add, and delete memory entries
 *
 * WHY: Admins need to inspect and manage the memory layer for debugging and moderation.
 * HOW: Client component handles interactive search, add, and delete operations.
 */

'use client';

import { useState, useEffect } from 'react';
import { trackEvent } from '../../hooks/use-analytics';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
const API_KEY = process.env.NEXT_PUBLIC_API_INTERNAL_KEY ?? '';

/** Auth headers for client-side API calls (admin app is behind Clerk auth gate). */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (API_KEY) h['x-api-key'] = API_KEY;
  return h;
}

interface MemoryEntry {
  id: string;
  content: string;
  userId: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export default function MemoryPage() {
  const [userId, setUserId] = useState('user-123');
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ entry: MemoryEntry; score: number }>>([]);
  const [newContent, setNewContent] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/memory/${userId}`, { headers: authHeaders() });
        if (res.ok) {
          const data: unknown = await res.json();
          setMemories(Array.isArray(data) ? data as MemoryEntry[] : []);
        } else {
          setStatus('Memory service unavailable');
        }
      } catch {
        setStatus('Could not load memories');
      }
    }
    load();
  }, [userId]);

  async function loadMemories() {
    try {
      const res = await fetch(`${API_URL}/api/memory/${userId}`, { headers: authHeaders() });
      if (res.ok) {
        const data: unknown = await res.json();
        setMemories(Array.isArray(data) ? data as MemoryEntry[] : []);
      } else {
        setStatus('Memory service unavailable');
      }
    } catch {
      setStatus('Could not load memories');
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/memory/search?q=${encodeURIComponent(searchQuery)}&userId=${userId}`, { headers: authHeaders() });
      if (res.ok) {
        const results = await res.json() as Array<{ entry: MemoryEntry; score: number }>;
        setSearchResults(results);
        trackEvent('memory_searched', { query: searchQuery, resultCount: results.length });
      }
    } catch {
      setStatus('Search failed');
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setStatus('');
    try {
      const res = await fetch(`${API_URL}/api/memory`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content: newContent, userId }),
      });
      if (res.ok) {
        setNewContent('');
        setStatus('Memory added');
        trackEvent('memory_added', { userId });
        loadMemories();
      } else {
        const json = await res.json() as { error?: string };
        setStatus(`Error: ${json.error ?? 'Unknown'}`);
      }
    } catch {
      setStatus('Could not reach API');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this memory entry?')) return;
    try {
      await fetch(`${API_URL}/api/memory/${id}`, { method: 'DELETE', headers: authHeaders() });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setStatus('Delete failed');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Memory Browser</h1>
      <p className="mt-1 text-gray-500">Inspect and manage user memory entries.</p>

      {/* User selector */}
      <div className="mt-4">
        <label className="text-sm font-medium text-gray-700">
          User ID:{' '}
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {status && (
        <p className={`mt-3 rounded p-2 text-sm ${status.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {status}
        </p>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories..."
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Search
        </button>
      </form>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-gray-500">Search Results</h2>
          <ul className="mt-2 space-y-2">
            {searchResults.map((r) => (
              <li key={r.entry.id} className="rounded border border-blue-100 bg-blue-50 p-3 text-sm">
                <span className="text-gray-700">{r.entry.content}</span>
                <span className="ml-2 text-xs text-gray-400">score: {r.score.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add memory */}
      <form onSubmit={handleAdd} className="mt-6 flex gap-2">
        <input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add a memory entry..."
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
          Add
        </button>
      </form>

      {/* Memory list */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-500">All Memories ({memories.length})</h2>
        {memories.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No memories found for this user.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {memories.map((m) => (
              <li key={m.id} className="flex items-start justify-between rounded border border-gray-200 bg-white p-3">
                <div>
                  <p className="text-sm text-gray-700">{m.content}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {m.agentId && `Agent: ${m.agentId} | `}ID: {m.id}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="ml-4 text-xs text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
