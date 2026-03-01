/**
 * FILE PURPOSE: Admin homepage — displays users from API
 *
 * WHY: Replaces hardcoded users with live data from the API server.
 * HOW: Server component fetches GET /api/users and renders a table.
 */

import type { AdminUser } from '@playbook/shared-types';
import { StatusBadge } from '@playbook/shared-ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

const ROLE_STATUS = { owner: 'active', editor: 'draft', viewer: 'deprecated' } as const;

async function getUsers(): Promise<AdminUser[]> {
  try {
    const res = await fetch(`${API_URL}/api/users`, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json() as AdminUser[];
  } catch {
    return [];
  }
}

export default async function AdminPage() {
  const users = await getUsers();

  return (
    <div>
      <h1 className="text-2xl font-bold">Users</h1>
      <p className="mt-1 text-gray-500">Manage playbook contributors.</p>

      {users.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">
          No users loaded. Ensure the API server is running at {API_URL}.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{u.name}</td>
                  <td className="py-2 pr-4 text-gray-500">{u.email}</td>
                  <td className="py-2">
                    <StatusBadge status={ROLE_STATUS[u.role]} label={u.role} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
