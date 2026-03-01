import type { Metadata } from 'next';
import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { PostHogProvider } from '../providers/posthog-provider';
import { ClerkProviderShell } from '../providers/clerk-provider-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Product Playbook',
  description: 'LLM-Maintained Enterprise Playbook',
};

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
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
          {clerkEnabled && (
            <div className="ml-auto flex items-center gap-3">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
                    Sign In
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
            </div>
          )}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        <PostHogProvider>
          {clerkEnabled ? (
            <ClerkProviderShell>
              <AppShell>{children}</AppShell>
            </ClerkProviderShell>
          ) : (
            <AppShell>{children}</AppShell>
          )}
        </PostHogProvider>
      </body>
    </html>
  );
}
