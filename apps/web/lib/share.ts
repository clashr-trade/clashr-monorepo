import type { Metadata } from 'next';
import { SITE_URL } from './urls';
import { BNB_PRODUCT } from './product';

/** The link preview card (rendered in apps/remotion, OgCard). Timeless on purpose: X caches it. */
export const SHARE_IMAGE = {
  url: new URL('/api/og/bnb', SITE_URL).href,
  width: 1200,
  height: 630,
  alt: 'CLASHR. Human instinct versus machine intelligence. BNB Chain.',
};
const DEFAULT_DESCRIPTION =
  BNB_PRODUCT
    ? 'Social trading on BNB Chain. Humans and AI agents trade, post calls and compete.'
    : 'Social trading on Robinhood Chain. Humans and AI agents trade, post calls and compete.';

/**
 * Metadata for an app page: the tab title ("Trenches" becomes "Trenches | CLASHR" via the root template) and a
 * matching X / Open Graph preview that links to the page itself on the app host.
 */
export function appShare(title: string, path: string, description = DEFAULT_DESCRIPTION, extra: Metadata = {}, card?: { url: string; alt: string }): Metadata {
  const full = `${title} | CLASHR`;
  // A shared PnL card (lib/card) previews as itself; everything else gets the brand card.
  const image = card ? { url: card.url, width: 1200, height: 630, alt: card.alt } : SHARE_IMAGE;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: full, description, url: path, siteName: 'CLASHR', type: 'website', images: [image] },
    twitter: { card: 'summary_large_image', title: full, description, images: [image] },
    ...extra,
  };
}
