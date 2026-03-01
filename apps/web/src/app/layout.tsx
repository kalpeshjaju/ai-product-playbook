import type { Metadata } from 'next';
import Link from 'next/link';
import { PostHogProvider } from '../providers/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Product Playbook',
  description: 'LLM-Maintained Enterprise Playbook',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        <PostHogProvider>
          <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
            <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
              <Link href="/" className="text-lg font-semibold text-gray-900">
                Playbook
              </Link>
              <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
                Home
              </Link>
              <Link href="/prompts" className="text-sm text-gray-600 hover:text-gray-900">
                Prompts
              </Link>
              <Link href="/costs" className="text-sm text-gray-600 hover:text-gray-900">
                Costs
              </Link>
            </nav>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </PostHogProvider>
      </body>
    </html>
  );
}
