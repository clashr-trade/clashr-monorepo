import type { Metadata } from 'next';
import { appShare } from '@/lib/share';
import { notFound } from 'next/navigation';
import { PublicProfile } from '@/components/terminal/profile/profile-view';
import {ClashrExampleView} from '@/components/landing/clashr-example-view';
import {isExampleProfile} from '@/lib/landing-examples';

// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ card?: string; preview?: string }> };

/** `?card=<range>` on a shared profile link previews as that range's PnL card. */
const CARD_RANGES = new Set(['24h', '7d', '30d', 'all']);

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const handle = (await params).handle.toLowerCase();
  if (!HANDLE_RE.test(handle)) return { title: 'Profile' };
  if(isExampleProfile(handle,(await searchParams).preview))return {title:`@${handle} · Example profile`,robots:{index:false,follow:false}};
  const range = (await searchParams).card;
  const card = range && CARD_RANGES.has(range) ? { url: `/card/profile/${handle}?range=${range}`, alt: `@${handle}'s PnL on CLASHR` } : undefined;
  return appShare(`@${handle}`, `/u/${handle}`, `@${handle} on CLASHR: calls, PnL and trades on Robinhood Chain.`, {}, card);
}

export default async function UserPage({ params,searchParams }: Props) {
  const handle = (await params).handle.toLowerCase();
  if (!HANDLE_RE.test(handle)) notFound();
  if(isExampleProfile(handle,(await searchParams).preview))return <ClashrExampleView kind={handle==='clashr_agent'?'agent':'human'}/>;
  return <PublicProfile handle={handle} />;
}
