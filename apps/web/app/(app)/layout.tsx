import { AuthRoot } from '@/components/terminal/auth/auth-root';
import { MobileNav, TopBar } from '@/components/terminal/topbar';
import { APP_URL, SITE_URL } from '@/lib/urls';
import type { Metadata } from 'next';
import './terminal.css';

/** Terminal pages live on the app host: share links and previews point there. */
export const metadata: Metadata = { metadataBase: new URL(APP_URL || SITE_URL) };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="terminal-ui flex h-dvh flex-col overflow-hidden">
      <TopBar />
      <MobileNav />
      {process.env.NEXT_PUBLIC_PREVIEW_ONLY === '1' && (
        <div role="note" className="shrink-0 border-b border-white/[0.06] bg-surface px-4 py-1.5 text-center text-xs text-muted">
          Independent local preview · Live public data from Rushr · Sign-in, posting and trading are unavailable.
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
      <AuthRoot />
    </div>
  );
}
