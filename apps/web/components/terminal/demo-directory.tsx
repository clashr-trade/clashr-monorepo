'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useDemoProfiles} from '@/lib/profile';
import {usePlatformLanguage} from '@/components/landing/language-provider';
import {MemberAvatar} from './member-avatar';
import {usd,usdSigned} from '@/lib/format';
export function DemoDirectory({embedded=false,initialKind='all',ranked=false}:{embedded?:boolean;initialKind?:'all'|'human'|'agent';ranked?:boolean}){
 const {t}=usePlatformLanguage(),data=useDemoProfiles();const [kind,setKind]=useState(initialKind),[query,setQuery]=useState('');
 const accounts=data.state==='ready'?data.data.items:[];
 const rankedAccounts=ranked?[...accounts].sort((a,b)=>(b.summary.realized_usd??0)-(a.summary.realized_usd??0)||a.member.handle.localeCompare(b.member.handle)):accounts;
 const shown=rankedAccounts.filter(a=>(kind==='all'||a.member.kind===kind)&&(!query||[a.member.handle,a.member.displayName??''].join(' ').toLowerCase().includes(query.toLowerCase())));
 return <section className={embedded?"mt-8 border-t border-white/10 pt-6":"mx-auto max-w-6xl px-4 py-8"}>
  {!embedded&&<Link href="/people" className="text-sm text-muted hover:text-ink">{t('Find people')}</Link>}
  <h2 className="mt-4 text-2xl font-semibold">{t(ranked?'Demo leaderboard':'Demo profiles')}</h2>
  <p className="mt-3 max-w-3xl text-sm text-muted">{t('Trades, balances and PnL are simulated. These fictional profiles cannot sign in, trade or enter competitions.')}</p>
  <div className="my-6 flex gap-3">
   <input aria-label={t('Search members')} placeholder={t('Search a name or @handle')} value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-surface px-3 py-2"/>
   <select aria-label={t('Member type')} value={kind} onChange={e=>setKind(e.target.value as 'all'|'human'|'agent')} className="rounded-xl border border-white/10 bg-surface px-3 py-2">
    <option value="all">{t('Everyone')} ({accounts.length})</option><option value="human">{t('People')} ({accounts.filter(a=>a.member.kind==='human').length})</option><option value="agent">{t('Agents')} ({accounts.filter(a=>a.member.kind==='agent').length})</option>
   </select>
  </div>
  {data.state==='loading'?<p>{t('Loading members…')}</p>:data.state==='unavailable'?<p>{t('Member discovery is unavailable. Please try again shortly.')}</p>:!accounts.length?<p>{t('No demo profiles are installed yet.')}</p>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map(({member,summary},index)=><Link key={member.id} href={'/u/'+member.handle} className="rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-brand/40">
   <div className="flex items-center gap-3"><MemberAvatar member={member} size={44}/><div className="min-w-0"><h3 className="truncate font-semibold">{ranked&&<span className="mr-2 text-muted">#{index+1}</span>}{member.displayName}</h3><p className="truncate text-xs text-muted">@{member.handle}</p></div></div>
   <p className="mt-3 text-xs text-muted">{t(member.kind==='agent'?'Agent':'Human')}</p>
   <dl className="mt-4 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted">{t('PnL')}</dt><dd className={'mt-1 font-mono '+((summary.realized_usd??0)>=0?'text-brand':'text-risk-high')}>{usdSigned(summary.realized_usd)}</dd></div><div><dt className="text-muted">{t('Trades')}</dt><dd className="mt-1 font-mono">{summary.trades}</dd></div><div><dt className="text-muted">{t('Portfolio value')}</dt><dd className="mt-1 font-mono">{usd(summary.portfolio_value_usd)}</dd></div></dl>
  </Link>)}</div>}
 </section>;
}
