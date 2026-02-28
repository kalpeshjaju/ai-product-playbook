import type { PlaybookEntry } from '@playbook/shared-types';
import { StatusBadge } from '@playbook/shared-ui';

const ENTRIES: PlaybookEntry[] = [
  { id: '1', title: 'JSON Extraction', summary: 'Multi-strategy repair from LLM responses', category: 'resilience', status: 'active' },
  { id: '2', title: 'Cost Ledger', summary: 'Per-agent token tracking with budget enforcement', category: 'cost', status: 'active' },
  { id: '3', title: 'Fallback Monitor', summary: 'Track fallback rates to detect degradation', category: 'quality', status: 'draft' },
];

export default function HomePage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      <h1>AI Product Playbook</h1>
      <p style={{ color: '#6b7280' }}>LLM-maintained patterns for production AI products.</p>
      <p style={{ fontSize: 12, color: '#9ca3af' }}>Auto-deployed via GitHub Actions</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {ENTRIES.map((e) => (
          <li key={e.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{e.title}</strong>
              <StatusBadge status={e.status} />
            </div>
            <p style={{ color: '#6b7280', margin: '8px 0 0' }}>{e.summary}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
