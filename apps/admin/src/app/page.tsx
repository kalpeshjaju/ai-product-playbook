import type { AdminUser } from '@playbook/shared-types';
import { StatusBadge } from '@playbook/shared-ui';

const USERS: AdminUser[] = [
  { id: 'u1', name: 'Kalpesh Jaju', email: 'kalpesh@example.com', role: 'owner' },
  { id: 'u2', name: 'Claude Opus', email: 'claude@anthropic.com', role: 'editor' },
  { id: 'u3', name: 'Gemini Pro', email: 'gemini@google.com', role: 'viewer' },
];

const ROLE_STATUS = { owner: 'active', editor: 'draft', viewer: 'deprecated' } as const;

export default function AdminPage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      <h1>Admin Panel</h1>
      <p>Manage playbook contributors.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #e5e7eb' }}>Name</th>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #e5e7eb' }}>Email</th>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #e5e7eb' }}>Role</th>
          </tr>
        </thead>
        <tbody>
          {USERS.map((u) => (
            <tr key={u.id}>
              <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>{u.name}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>{u.email}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                <StatusBadge status={ROLE_STATUS[u.role]} label={u.role} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
