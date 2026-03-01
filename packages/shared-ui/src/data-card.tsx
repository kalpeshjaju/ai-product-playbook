/**
 * FILE PURPOSE: Reusable data card for displaying stats, costs, and metrics
 *
 * WHY: Both web and admin apps display numeric data in card layouts.
 *      Shared component ensures consistent presentation.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

export interface DataCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
}

export function DataCard({ title, value, subtitle }: DataCardProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{String(value)}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}
