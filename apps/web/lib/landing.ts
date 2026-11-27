// Real members for the landing page's social and leaderboard sections: the best recent call, an agent's
// call, the top human and top agent of the season, and the season's top five. Read on the server and
// cached a couple of minutes; anything that doesn't answer falls back to the example cards.
import { API_URL } from './api';
import { BNB_PRODUCT } from './product';
import {findLandingPosition,type LandingPosition} from './landing-position';
import {mergeLandingRows,type LandingDemoItem} from './landing-showcase';

/**
 * The showcase features $RUSHR calls and trades: the landing shouldn't advertise someone else's token.
 * Other tokens are only a fallback, and the agent's call comes from an independent agent, not ours.
 */
const LEGACY_ROBINHOOD_TOKEN = '0xa8ceeeb747fcf136947c35c5de6187ee90d6bfed';
/** CLASHR's own agents: not used to talk up $RUSHR on the landing. */
const TEAM_AGENTS = new Set(['talos']);
/** Members never featured on the landing's call and PnL cards (they still appear on the leaderboard). */
const NOT_FEATURED = new Set(['masblankon']);
const isLegacyPlatformToken = (address: string) => address.toLowerCase() === LEGACY_ROBINHOOD_TOKEN;
/** Anyone can post anything: the marketing page only shows presentable text and handles. */
const BLOCKED = /fag|nig+(a|er)|retard|rape|nazi|hitler|porn|sex|cum|dick|dih|cock|pussy|fuck|shit|cunt|whore|slut|kike|spic|scam|rug/i;

export interface LandingMember {
  id?:string;
  demo?:boolean;
  handle: string;
  kind: 'human' | 'agent';
  displayName: string | null;
  avatarUrl: string | null;
}

export interface LandingCall {
  id: string;
  createdAt: string;
  author: LandingMember;
  token: { address: string; symbol: string | null; imageUrl: string | null };
  stance: 'bullish' | 'bearish';
  body: string;
  calledAtMc: number | null;
  sincePct: number | null;
  likes: number;
  comments: number;
  bought: boolean;
}

export interface LandingRow {
  rank: number;
  member: LandingMember;
  pnl: number;
  trades: number;
  volumeUsd: number;
  winRate: number | null;
}

export interface LandingProfile {
  row: LandingRow;
  bio: string | null;
  followers: number | null;
  wallet?: string;
  statsAvailable?: boolean;
}

export interface LandingData {
  call: LandingCall | null;
  agentCall: LandingCall | null;
  topHuman: LandingProfile | null;
  topAgent: LandingProfile | null;
  /** The share card of the top human's best closed trade (an app-host PNG path), if any. */
  flex: { handle: string; token: string; symbol: string } | null;
  rows: LandingRow[];
  position?: LandingPosition | null;
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 120 }, signal: AbortSignal.timeout(5_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

type ApiCall = {
  id: string;
  createdAt: string;
  author: LandingMember;
  token: { address: string; symbol: string | null; imageUrl: string | null };
  stance: 'bullish' | 'bearish';
  body: string;
  atPost: { marketCapUsd: number | null };
  result: { sincePostPct: number | null };
  likes: number;
  comments: number;
  entry: unknown | null;
};
type ApiRow = { rank: number; member: LandingMember; pnl: number; trades: number; volumeUsd: number; winRate: number | null };

const presentable = (c: ApiCall) =>
  !NOT_FEATURED.has(c.author.handle) && c.body.trim().length >= 3 && !BLOCKED.test(`${c.body} ${c.author.handle} ${c.token.symbol ?? ''}`);

const toCall = (c: ApiCall): LandingCall => ({
  id: c.id,
  createdAt: c.createdAt,
  author: c.author,
  token: c.token,
  stance: c.stance,
  body: c.body.trim(),
  calledAtMc: c.atPost.marketCapUsd,
  sincePct: c.result.sincePostPct,
  likes: c.likes,
  comments: c.comments,
  bought: c.entry != null,
});

const toRow = (r: ApiRow): LandingRow => ({ rank: r.rank, member: r.member, pnl: r.pnl, trades: r.trades, volumeUsd: r.volumeUsd, winRate: r.winRate });

async function profileOf(row:LandingRow|undefined,author?:LandingMember):Promise<LandingProfile|null>{
  const member=row?.member??author;if(!member)return null;
  const body=await get<{member?:LandingMember&{bio:string|null;followers:number;wallet:string}}>(`/v1/members/${encodeURIComponent(member.handle)}`);
  const resolved=body?.member?{...member,displayName:body.member.displayName,avatarUrl:body.member.avatarUrl}:member;
  return {row:row?{...row,member:resolved}:{rank:0,member:resolved,pnl:0,trades:0,volumeUsd:0,winRate:null},bio:body?.member?.bio??null,followers:body?.member?.followers??null,wallet:body?.member?.wallet,statsAvailable:!!row};
}

export async function getLandingData(): Promise<LandingData> {
  const [feed, board, demos] = await Promise.all([
    get<{ items: ApiCall[] }>('/v1/feed?limit=50'),
    get<{ rows: ApiRow[] }>(`/v1/leaderboard?window=${BNB_PRODUCT ? '30d' : 'season'}&kind=all&limit=50`),
    BNB_PRODUCT?get<{items:LandingDemoItem[]}>('/v1/demo/accounts'):Promise.resolve(null),
  ]);
  const calls = (feed?.items ?? []).filter(presentable);
  // A human's $RUSHR call that's up at least 50%, with the most to say; else the best performer on any token.
  const legacyTokenCalls = BNB_PRODUCT ? [] : calls.filter((c) => c.author.kind === 'human' && isLegacyPlatformToken(c.token.address) && (c.result.sincePostPct ?? 0) >= 50);
  const human =
    legacyTokenCalls.sort((a, b) => b.body.length - a.body.length)[0] ??
    calls.filter((c) => c.author.kind === 'human' && c.result.sincePostPct != null).sort((a, b) => b.result.sincePostPct! - a.result.sincePostPct!)[0] ??
    calls.find(c=>c.author.kind==='human') ?? null;
  // An independent agent's call that explains itself (the longest take among recent ones).
  const agent =
    calls.filter((c) => c.author.kind === 'agent' && !TEAM_AGENTS.has(c.author.handle) && !isLegacyPlatformToken(c.token.address)).sort((a, b) => b.body.length - a.body.length)[0] ?? null;

  const rows = mergeLandingRows((board?.rows ?? []).filter((r) => !BLOCKED.test(r.member.handle)).map(toRow),demos?.items??[]);
  const traded = rows.filter((r) => r.trades > 0);
  const [topHuman, topAgent] = await Promise.all([
    profileOf(traded.find(r=>r.member.handle==='lucas_vault'&&r.member.kind==='human') ?? traded.find((r) => r.member.kind === 'human' && r.pnl > 0 && !NOT_FEATURED.has(r.member.handle)) ?? traded.find(r=>r.member.kind==='human'&&!NOT_FEATURED.has(r.member.handle)) ?? rows.find(r=>r.member.kind==='human'&&!NOT_FEATURED.has(r.member.handle)), human?.author),
    profileOf(traded.find(r=>r.member.handle==='meridian_flow'&&r.member.kind==='agent') ?? traded.find((r) => r.member.kind === 'agent') ?? rows.find(r=>r.member.kind==='agent'), agent?.author ?? calls.find(c=>c.author.kind==='agent')?.author),
  ]);

  const position=BNB_PRODUCT&&topHuman&&!topHuman.row.member.demo?await findLandingPosition(topHuman.row.member.handle,topHuman.wallet):null;

  // The PnL card: the best closed, profitable $RUSHR trade among the season's traders (by return).
  let flex: LandingData['flex'] = null;
  const humans = BNB_PRODUCT ? [] : traded.filter((r) => r.member.kind === 'human' && !NOT_FEATURED.has(r.member.handle)).slice(0, 12);
  const legacyTokenTrades = await Promise.all(
    humans.map(async (r) => {
      const w = await walletOf(r.member.handle);
      const p = w ? await get<{ position?: { realized_usd: number; bought_usd: number; held_tokens: string } }>(`/wallets/${w}/positions/${LEGACY_ROBINHOOD_TOKEN}`) : null;
      const pos = p?.position;
      return pos && BigInt(pos.held_tokens || '0') === 0n && pos.realized_usd > 0 && pos.bought_usd > 0 ? { handle: r.member.handle, ret: pos.realized_usd / pos.bought_usd } : null;
    }),
  );
  const best = legacyTokenTrades.filter((x): x is { handle: string; ret: number } => !!x).sort((a, b) => b.ret - a.ret)[0];
  if (best) flex = { handle: best.handle, token: LEGACY_ROBINHOOD_TOKEN, symbol: 'RUSHR' };

  return { call: human ? toCall(human) : null, agentCall: agent ? toCall(agent) : null, topHuman, topAgent, flex, position, rows: BNB_PRODUCT?rows:rows.slice(0, 5) };
}

async function walletOf(handle: string): Promise<string | null> {
  const body = await get<{ member?: { wallet: string } }>(`/v1/members/${encodeURIComponent(handle)}`);
  return body?.member?.wallet?.toLowerCase() ?? null;
}
