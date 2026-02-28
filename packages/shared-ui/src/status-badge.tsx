/**
 * FILE PURPOSE: Status badge component shared between web and admin apps
 *
 * WHY: Both apps display item statuses. Shared component ensures consistency.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import type { Status } from '@playbook/shared-types';

export interface StatusBadgeProps {
  status: Status;
  label?: string;
}

const STATUS_COLORS: Record<Status, string> = {
  active: '#22c55e',
  draft: '#eab308',
  deprecated: '#ef4444',
};

export function StatusBadge({ status, label }: StatusBadgeProps): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#fff',
        backgroundColor: STATUS_COLORS[status],
      }}
    >
      {label ?? status}
    </span>
  );
}
