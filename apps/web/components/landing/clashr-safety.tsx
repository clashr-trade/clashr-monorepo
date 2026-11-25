'use client';

import {useState, type FormEvent} from 'react';
import {ArrowUpRight, MagnifyingGlass, ShieldCheck} from '@phosphor-icons/react/dist/ssr';
import {BRAND_MARK} from '@/lib/brand';
import {appHref} from '@/lib/urls';
import {useLandingLanguage} from './language-provider';

const MARKETS = [
  {symbol:'CAKE',address:'0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',icon:'🥞'},
  {symbol:'WBNB',address:'0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',icon:'B'},
  {symbol:'USDT',address:'0x55d398326f99059ff775485246999027b3197955',icon:'$'},
] as const;
// Deliberate illustration data, never displayed as actual token history or prices.
const PATH = [32,31,37,52,10,62,72,67,80,84,85,101,102,102,106,110,119,151,153,148,140,120,153,161,157,148,141,170,164,142,147,141,148,129];

function ChartPreview({frame}:{frame:'1m'|'5m'|'1h'}) {
  const {t}=useLandingLanguage();
  const stride=frame==='1m'?1:frame==='5m'?2:4;
  const bars=PATH.filter((_,i)=>i%stride===0);
  return <svg viewBox="0 0 600 280" role="img" aria-label={t('Illustrative chart. Not live market data.')} className="clashr-safety-chart">
    {[50,110,170,230].map(y=><line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#ffffff09"/>)}
    {bars.slice(1).map((close,i)=>{const open=bars[i] ?? close;const x=18+i*(564/(bars.length-1));const color=close>=open?'#f0b90b':'#ff7966';return <g key={i}><line x1={x} x2={x} y1={270-Math.max(open,close)-12} y2={270-Math.min(open,close)+14} stroke={color}/><rect x={x-5} y={270-Math.max(open,close)} width="10" height={Math.max(3,Math.abs(close-open))} fill={color}/></g>;})}
  </svg>;
}

function TerminalPreview() {
  const {t}=useLandingLanguage();
  const [selected,setSelected]=useState(0);
  const [side,setSide]=useState<'buy'|'sell'>('buy');
  const [frame,setFrame]=useState<'1m'|'5m'|'1h'>('1m');
  const [amount,setAmount]=useState('0.1');
  const [contract,setContract]=useState('');
  const market=MARKETS[selected] ?? MARKETS[0];
  const href=appHref(`/token/${market.address}`);
  function search(event:FormEvent<HTMLFormElement>){event.preventDefault();window.location.assign(appHref(`/token/${contract.trim().toLowerCase()}`));}
  return <div className="clashr-safety-terminal">
    <header className="clashr-safety-terminal-nav"><a href={appHref('/trenches')} className="clashr-safety-brand"><img src={BRAND_MARK} width={19} height={19} alt=""/>CLASHR</a><nav aria-label={t('Terminal navigation')}><a href={appHref('/trenches')}>{t('Trenches')}</a><a href={appHref('/feed')}>{t('Feed')}</a><a href={appHref('/agents')}>{t('Agents')}</a><a href={appHref('/leaderboard')}>{t('Leaderboard')}</a></nav><form className="clashr-safety-search" onSubmit={search}><label className="sr-only" htmlFor="safety-contract">{t('BNB contract address')}</label><MagnifyingGlass size={16}/><input id="safety-contract" value={contract} onChange={event=>setContract(event.target.value)} placeholder={t('BNB contract address')} required pattern="0x[a-fA-F0-9]{40}"/><button type="submit">{t('Open')}</button></form><span className="clashr-social-status">{t('Preview')}</span></header>
    <div className="clashr-safety-terminal-grid">
      <aside className="clashr-safety-market-list"><h3>{t('Trending')} <small>24h</small></h3>{MARKETS.map((item,i)=><button key={item.symbol} type="button" aria-pressed={i===selected} onClick={()=>setSelected(i)}><span className="clashr-safety-token-icon">{item.icon}</span><span><strong>{item.symbol}</strong><small>{item.address.slice(0,6)}…{item.address.slice(-4)}</small></span></button>)}<a href={appHref('/trenches')} className="clashr-section-link">{t('New pairs')} <ArrowUpRight size={13}/></a><p>{t('Discover Flap launches on BNB Chain.')}</p><div className="clashr-safety-more-tokens">{['BAKE','FLOKI','TWT','XVS'].map(symbol=><a key={symbol} href={appHref('/trenches')}><span className="clashr-safety-token-icon">{symbol[0]}</span><span><strong>{symbol}</strong><small>{t('Preview')}</small></span><span>{t('BNB markets')}</span></a>)}</div></aside>
      <div className="clashr-safety-market"><div className="clashr-safety-market-heading"><div><a href={href}><strong>{market.symbol}</strong> <ArrowUpRight size={13}/></a><span>{market.address.slice(0,6)}…{market.address.slice(-4)} · BNB Chain</span></div><dl className="clashr-safety-market-stats"><div><dt>{t('Market cap')}</dt><dd>$103.0M</dd></div><div><dt>{t('24h volume')}</dt><dd>$6.8M</dd></div><div><dt>{t('Liquidity')}</dt><dd>$5.2M</dd></div><div><dt>24h</dt><dd className="clashr-board-loss">-1.6%</dd></div></dl><div className="clashr-safety-timeframes" role="group" aria-label={t('Chart interval')}>{(['1m','5m','1h'] as const).map(value=><button key={value} type="button" aria-pressed={frame===value} onClick={()=>setFrame(value)}>{value}</button>)}</div></div><ChartPreview frame={frame}/><div className="clashr-safety-trades-preview">{[165,16,69,130].map((value,i)=><a key={value} href={href}><span className={i===0?'clashr-board-loss':'clashr-board-gain'}>{t(i===0?'Sell':'Buy')}</span><strong>${value}</strong><code>{market.address.slice(0,6)}…{market.address.slice(-4)}</code><span>1m</span></a>)}</div><p className="clashr-safety-chart-note">{t('Illustrative chart. Not live market data.')}</p></div>
      <aside className="clashr-safety-trade"><div className="clashr-safety-trade-tabs" role="group" aria-label={t('Trade side')}>{(['buy','sell'] as const).map(value=><button key={value} type="button" aria-pressed={side===value} onClick={()=>setSide(value)}>{t(value==='buy'?'Buy':'Sell')}</button>)}</div><label htmlFor="safety-amount">{t('Preview amount')} ({side==='buy'?'BNB':market.symbol})</label><input id="safety-amount" type="number" min="0" step="any" value={amount} onChange={event=>setAmount(event.target.value)}/><div className="clashr-safety-presets">{['0.01','0.05','0.1','0.5'].map(value=><button key={value} type="button" aria-pressed={amount===value} onClick={()=>setAmount(value)}>{value}</button>)}</div><a href={href} className="clashr-social-primary">{t('Open market')} <ArrowUpRight size={13}/></a><div className="clashr-safety-checks"><ShieldCheck size={19}/><h3>{t('Copycat check')} <span>{t('Preview')}</span></h3><ul className="clashr-safety-risk-examples">{['0xe364…e10f','0xaad9…144c','0x6c0a…476a','0xffab…54d4'].map((address,i)=><li key={address}><code>{address}</code><span>{212-i*2} {t('Holders')}</span><em>{t('High risk')}</em></li>)}</ul><p>{t('Holder concentration')}</p><span>{t('When indexed')}</span><p>{t('Early buyers & funding links')}</p><span>{t('Coverage varies')}</span></div></aside>
    </div>
  </div>;
}

function CopycatCard(){
  const {t}=useLandingLanguage();
  return <article className="clashr-feature-card clashr-safety-copycat"><div className="clashr-card-top"><span className="clashr-eyebrow">{t('Copycat check')}</span><span className="clashr-social-status">{t('Preview')}</span></div><h3>{t('Spot the fake before anyone buys it.')}</h3><div className="clashr-safety-contract-example"><span className="clashr-safety-token-icon">🥞</span><strong>$CAKE</strong><code>0x1234…abcd</code><span className="clashr-safety-badge-high">{t('High risk')}</span><p>{t('Same ticker, different contract. Check the address before trading.')}</p></div><a href="https://bscscan.com/token/0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82" target="_blank" rel="noopener noreferrer" className="clashr-safety-contract-link"><span className="clashr-safety-token-icon">🥞</span><strong>$CAKE</strong><code>0x0e09…ce82</code><span className="clashr-safety-badge-original">{t('Original')}</span><p>{t('Verify the original contract, holders and liquidity on the explorer.')}</p></a><a href={appHref('/trenches')} className="clashr-section-link">{t('Explore BNB markets')} <ArrowUpRight size={16}/></a></article>;
}

function HolderMapCard(){
  const {t}=useLandingLanguage();
  const nodes: [number,number,number][]=[[70,75,14],[105,130,34],[170,90,22],[190,175,26],[65,200,15],[260,170,13],[330,100,28],[385,75,16],[375,155,23],[320,200,18],[420,215,13]];
  return <article className="clashr-feature-card clashr-safety-holder-map"><div className="clashr-card-top"><span className="clashr-eyebrow">{t('Holder map')}</span><span className="clashr-small-tag">{t('Coming soon')}</span></div><h3>{t("See who's really holding.")}</h3><svg viewBox="0 0 480 260" role="img" aria-label={t('Illustrative holder relationships. Planned feature.')} className="clashr-safety-bubbles">{([[0,1],[1,2],[1,3],[1,4],[5,6],[6,7],[6,8],[6,9],[8,9],[8,10]] as const).map(([a,b])=><line key={`${a}-${b}`} x1={nodes[a]![0]} y1={nodes[a]![1]} x2={nodes[b]![0]} y2={nodes[b]![1]} stroke={a<5?'#f0b90b55':'#ff796666'}/>)}{nodes.map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill={i<6?'#f0b90b14':'#ff796614'} stroke={i<6?'#c7a554':'#ff7966'}/>)}</svg><p>{t('A planned view of holder clusters and shared funding links. This illustration is not an analysis of CAKE holders.')}</p><a href="/risk" className="clashr-section-link">{t('Read the risk disclosure')} <ArrowUpRight size={16}/></a></article>;
}

export function ClashrSafety(){
  const {t}=useLandingLanguage();
  return <section id="safety" className="clashr-safety-section"><div className="clashr-info-section clashr-wrap"><div className="clashr-section-head"><div><h2>{t('Know before you ape.')}<br/>{t('You and your agent.')}</h2></div><p>{t('Explore Flap markets on BNB Chain with token history, holder data and available safety signals in the same workspace.')}</p></div><TerminalPreview/><div className="clashr-feature-grid clashr-safety-cards"><CopycatCard/><HolderMapCard/></div><p className="clashr-section-note clashr-social-caption">{t('Illustrative market figures and risk examples.')} {t('Interactive interface preview. Open a market for current data and wallet trading.')}</p></div></section>;
}
