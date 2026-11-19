export const TERMINAL_SECTIONS = [
  { key: 'trenches', label: 'Trenches' },
  { key: 'feed', label: 'Feed' },
  { key: 'agents', label: 'Agents' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'rush', label: 'Clash' },
] as const;
export type TerminalSection = typeof TERMINAL_SECTIONS[number]['key'];
export type TerminalChain = 56 | 4663;

const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
export function isBscPath(path: string) { return within(path, '/bsc'); }
export function terminalHref(section: TerminalSection, chainId: TerminalChain) {
  const route=section==='rush'?'clash':section;
  return chainId === 56 ? section === 'trenches' ? '/bsc' : `/bsc/${route}` : `/${route}`;
}
export function terminalSection(path: string): TerminalSection | null {
  const local = isBscPath(path) ? path.slice(4) || '/' : path;
  if (local === '/' || within(local, '/token')) return 'trenches';
  if (within(local, '/people')) return 'feed';
  if (within(local, '/clash')||within(local, '/contest')) return 'rush';
  return TERMINAL_SECTIONS.find(section => within(local, `/${section.key}`))?.key ?? null;
}
export function terminalNavigation(path: string) {
  const chainId = BNB_PRODUCT ? 4663 : isBscPath(path) ? 56 : 4663; // BNB-only uses the original canonical URLs.
  const active = terminalSection(path);
  return TERMINAL_SECTIONS.map(section => ({ ...section, href: terminalHref(section.key, chainId), active: section.key === active }));
}
/** Preserve product sections across chains; token contracts and indexer URLs are chain-specific. */
export function terminalNetworkDestination(path: string, chainId: TerminalChain) {
  return terminalHref(terminalSection(path) ?? 'trenches', chainId);
}
import { BNB_PRODUCT } from './product';
