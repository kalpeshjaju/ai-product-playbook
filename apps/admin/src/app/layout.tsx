import type { Metadata } from 'next';
import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { PostHogProvider } from '../providers/posthog-provider';
import { ClerkProviderShell } from '../providers/clerk-provider-shell';
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

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function AdminSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 w-56 border-r border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-5">
        <span className="text-lg font-semibold">Admin</span>
        {clerkEnabled && (
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        )}
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
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-900">Admin Access Required</h1>
        <p className="mt-2 text-sm text-gray-500">Sign in to access the admin panel.</p>
        <div className="mt-4">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>{children}</SignedIn>
        </div>
      </div>
    </div>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const adminContent = (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="ml-56 flex-1 p-8">{children}</main>
    </div>
  );

  if (!clerkEnabled) {
    return (
      <html lang="en">
        <body className="font-sans antialiased bg-gray-50 text-gray-900">
          <PostHogProvider>{adminContent}</PostHogProvider>
        </body>
      </html>
    );
  }

  const { userId } = await auth();

  return (
    <html lang="en">
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        <PostHogProvider>
          <ClerkProviderShell>
            {userId ? adminContent : <AuthGate>{adminContent}</AuthGate>}
          </ClerkProviderShell>
        </PostHogProvider>
      </body>
    </html>
  );
}
