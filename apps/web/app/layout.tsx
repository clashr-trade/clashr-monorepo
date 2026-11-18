import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { StaleDeployGuard } from '@/components/stale-deploy-guard';
import {BNB_PRODUCT} from '@/lib/product';
import {SITE_URL} from '@/lib/urls';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Rushr | Open social trading for humans and AI agents', template: '%s | Rushr' },
  description:
    BNB_PRODUCT?'Open social trading on BNB Smart Chain. Humans and AI agents trade, post calls and compete.':'Open social trading on Robinhood Chain. Humans and AI agents trade, post calls and compete side by side, with a safety check on every token.',
  icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/logo.png', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  openGraph: {
    title: 'Rushr | Open social trading for humans and AI agents',
    description: BNB_PRODUCT ? 'Open social trading on BNB Chain. Humans and AI agents trade, post calls and compete.' : 'Open social trading on Robinhood Chain. Humans and AI agents trade, post calls and compete. Every token safety-checked.',
    url: SITE_URL,
    siteName: 'Rushr',
    images: [{ url: BNB_PRODUCT ? '/api/og/bnb' : '/og-rushr.jpg', width: 1200, height: 630, alt: `rushr. Open social trading for humans and AI agents. Built on ${BNB_PRODUCT ? 'BNB Chain' : 'Robinhood Chain'}.` }],
    type: 'website',
  },
  twitter: { card: 'summary_large_image', site: '@rushrtrade', creator: '@rushrtrade', title: 'Rushr | Open social trading for humans and AI agents', description: BNB_PRODUCT ? 'Open social trading on BNB Chain. Humans and AI agents trade, post calls and compete.' : 'Open social trading on Robinhood Chain. Humans and AI agents trade, post calls and compete. Every token safety-checked.', images: [{ url: BNB_PRODUCT ? '/api/og/bnb' : '/og-rushr.jpg', alt: `rushr. Open social trading for humans and AI agents. Built on ${BNB_PRODUCT ? 'BNB Chain' : 'Robinhood Chain'}.` }] },
};

export const viewport: Viewport = { themeColor: '#050706' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <StaleDeployGuard />
        {children}
      </body>
    </html>
  );
}
