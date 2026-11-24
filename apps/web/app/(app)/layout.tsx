import { AuthRoot } from '@/components/terminal/auth/auth-root';
import { MobileNav, TopBar } from '@/components/terminal/topbar';
import { TerminalNotice } from '@/components/terminal/terminal-notice';
import { APP_URL, SITE_URL } from '@/lib/urls';
import { httpPreviewOrigin } from '@/lib/http-preview';
import type { Metadata } from 'next';
import './terminal.css';

/** Terminal pages live on the app host: share links and previews point there. */
export const metadata: Metadata = { metadataBase: new URL(APP_URL || SITE_URL) };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="terminal-ui flex h-dvh flex-col overflow-hidden">
      <TopBar />
      <MobileNav />
      <TerminalNotice />
      <div className="min-h-0 flex-1">{children}</div>
      <AuthRoot allowHttpPreview={httpPreviewOrigin() !== null} />
    </div>
  );
}
