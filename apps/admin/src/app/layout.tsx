import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Panel',
  description: 'AI Product Playbook — Admin',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
