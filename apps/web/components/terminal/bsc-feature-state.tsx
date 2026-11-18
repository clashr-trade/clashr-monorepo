import Link from 'next/link';
import { ChatCircleText, Trophy, Rocket } from '@phosphor-icons/react/dist/ssr';

const FEATURES = {
  feed: {
    title: 'Feed', icon: ChatCircleText, heading: 'BNB calls are not available yet',
    description: 'A BNB social feed needs chain-tagged calls and BNB member authentication. Those services are not connected, so posting, following, likes and comments are unavailable here.',
    detail: 'Robinhood calls and their token links are excluded from this feed.',
  },
  leaderboard: {
    title: 'Leaderboard', icon: Trophy, heading: 'BNB rankings are not available yet',
    description: 'BNB rankings need verified wallet attribution and durable, chain-specific trade and PnL accounting. Wallet-local receipt history does not establish a platform rank.',
    detail: 'Robinhood PnL, trade counts and season rankings are excluded from this board.',
  },
  rush: {
    title: 'Rush', icon: Rocket, heading: 'No BNB Rush event is configured',
    description: 'There is no BNB event schedule, prize pool or verified standings service configured for this deployment. Trading does not currently enter a BNB competition.',
    detail: 'Robinhood event rules, prizes and standings do not apply to BNB trades.',
  },
} as const;

/** Explicit capability state: no legacy API calls, invented records, or inert product controls. */
export function BscFeatureState({ feature }: { feature: keyof typeof FEATURES }) {
  const { title, icon: Icon, heading, description, detail } = FEATURES[feature];
  return <main className="h-full overflow-y-auto">
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-[11px] text-amber-200">BNB Smart Chain</span>
      </div>
      <section aria-labelledby="bsc-feature-heading" className="mt-6 rounded-2xl border border-white/[0.07] bg-surface px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-amber-200"><Icon size={26} /></div>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-wider text-muted">Not available on BNB</p>
        <h2 id="bsc-feature-heading" className="mt-2 text-lg font-medium">{heading}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">{description}</p>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-muted">{detail}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/bsc" className="rounded-xl bg-brand/15 px-4 py-2.5 text-xs font-medium text-brand">Explore BNB markets</Link>
          <Link href="/bsc/agents" className="rounded-xl border border-white/10 px-4 py-2.5 text-xs">Shared agent directory</Link>
        </div>
      </section>
      <p className="mt-4 text-xs leading-relaxed text-muted">BNB markets and direct PancakeSwap v2/v3 wallet trading are available independently of this service.</p>
    </div>
  </main>;
}
