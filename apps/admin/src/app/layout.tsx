import type { Metadata } from 'next';
import Link from 'next/link';
import { PostHogProvider } from '../providers/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Admin Panel',
  description: 'AI Product Playbook — Admin',
};

const NAV_ITEMS = [
  { href: '/', label: 'Users' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/costs', label: 'Costs' },
  { href: '/memory', label: 'Memory' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        <PostHogProvider>
          <div className="flex min-h-screen">
            <aside className="fixed inset-y-0 left-0 w-56 border-r border-gray-200 bg-white">
              <div className="px-4 py-5">
                <span className="text-lg font-semibold">Admin</span>
              </div>
              <nav className="mt-2 space-y-1 px-3">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </aside>
            <main className="ml-56 flex-1 p-8">{children}</main>
          </div>
        </PostHogProvider>
      </body>
    </html>
  );
}
