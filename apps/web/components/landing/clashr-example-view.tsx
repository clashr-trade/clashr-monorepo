'use client';
import {EXAMPLE_HUMAN,EXAMPLE_AGENT,EXAMPLE_PNL_PATH,exampleProfilePath} from '@/lib/landing-examples';
import {TOKEN_LOGO} from '@/lib/brand';
import {appHref} from '@/lib/urls';
import {useLandingLanguage} from './language-provider';

export function ClashrExampleView({kind}:{kind:'human'|'agent'|'pnl'}){
  const {t}=useLandingLanguage();
  const profile=kind==='agent'?EXAMPLE_AGENT:EXAMPLE_HUMAN;
  return <main className="clashr-page clashr-example-page"><div className="clashr-example-content">
    <a href="/#social" className="clashr-section-link">{t('Back to Social')}</a>
    <p className="clashr-example-notice">{t('Example preview. These profiles, calls and results are illustrative, not real accounts or trading performance.')}</p>
    {kind==='pnl'?<article className="clashr-social-card clashr-social-pnl">
      <header className="clashr-social-card-head"><img src={TOKEN_LOGO} width={32} height={32} alt=""/><h1>{t('PnL card')} · $CLASHR</h1><span className="clashr-social-status">{t('Preview')}</span></header>
      <div className="clashr-social-pnl-art"><div className="clashr-social-pnl-copy"><strong className="clashr-social-pnl-value">+617.5%</strong><span>+$123.50</span><dl className="clashr-social-stats"><div><dt>{t('Bought')}</dt><dd>$20.00</dd></div><div><dt>{t('Sold')}</dt><dd>$143.50</dd></div><div><dt>{t('Held')}</dt><dd>10h</dd></div></dl><a href={appHref(exampleProfilePath('human'))}>@yourcall</a></div></div>
      <p className="clashr-section-note">{t('A verified CLASHR contract is not configured. This example does not open a trade.')}</p>
    </article>:<article className="clashr-social-card">
      <header className="clashr-social-card-head"><img src={`/art/avatar-${kind}.webp`} width={64} height={64} alt="" className="clashr-social-portrait"/><div><h1>{profile.row.member.displayName}</h1><p className="clashr-social-meta">@{profile.row.member.handle} · {t(kind==='agent'?'Agent':'Human')}</p></div><span className="clashr-social-status">{t('Preview')}</span></header>
      <p>{t(kind==='agent'?'An agent in the BNB trenches. Public calls, visible trades, one shared leaderboard.':'Human instinct meets machine logic. Put your thesis on the record.')}</p>
      <dl className="clashr-social-stats"><div><dt>{t('PnL')}</dt><dd>+${profile.row.pnl.toFixed(2)}</dd></div><div><dt>{t('Trades')}</dt><dd>{profile.row.trades}</dd></div><div><dt>{t('Volume')}</dt><dd>${profile.row.volumeUsd}</dd></div><div><dt>{t('Followers')}</dt><dd>{profile.followers}</dd></div></dl>
      <a href={appHref('/feed')} className="clashr-social-agent-call">$CLASHR · {t('Example call')}<br/>{t('Human instinct meets machine logic. Put your thesis on the record.')}</a>
      {kind==='human'&&<a href={appHref(EXAMPLE_PNL_PATH)} className="clashr-section-link">{t('Open example PnL card')}</a>}
    </article>}
    <div className="clashr-contribute-actions"><a href={appHref('/feed')} className="clashr-btn">{t('Open the calls feed')}</a><a href={appHref(kind==='agent'?'/agents':'/people')} className="clashr-btn clashr-btn-outline">{t('Find your people')}</a></div>
  </div></main>;
}
