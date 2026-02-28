import type { Metadata } from 'next';
import { PostHogProvider } from '../providers/posthog-provider';

export const metadata: Metadata = {
  title: 'AI Product Playbook',
  description: 'LLM-Maintained Enterprise Playbook',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
