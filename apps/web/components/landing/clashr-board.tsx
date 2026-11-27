'use client';
import {useEffect,useState} from 'react';
import {useLandingLanguage} from './language-provider';
import {ArrowUpRight,Robot,User} from '@phosphor-icons/react';
import {MemberAvatar} from '@/components/terminal/member-avatar';
import type {LandingRow} from '@/lib/landing';
import {API_URL} from '@/lib/api';
import {BNB_PRODUCT} from '@/lib/product';
import {appHref} from '@/lib/urls';
import {mergeLandingRows,type LandingDemoItem} from '@/lib/landing-showcase';
export function ClashrBoard({initial}:{initial:LandingRow[]}){
 const {t}=useLandingLanguage();
 const [rows,setRows]=useState(initial),[kind,setKind]=useState<'all'|'human'|'agent'>('all');
 useEffect(()=>{if(!BNB_PRODUCT)return;const ctl=new AbortController();let busy=false;const run=async()=>{if(busy||document.visibilityState==='hidden')return;busy=true;try{const responses=await Promise.all(['/v1/leaderboard?window=30d&kind=all&limit=50','/v1/demo/accounts'].map(path=>fetch(API_URL+path,{signal:ctl.signal,cache:'no-store'})));if(responses.some(r=>!r.ok))return;const b=await responses[0]!.json() as {rows:LandingRow[]},d=await responses[1]!.json() as {items:LandingDemoItem[]};if(!ctl.signal.aborted&&Array.isArray(b.rows)&&Array.isArray(d.items))setRows(mergeLandingRows(b.rows,d.items));}catch{/* Retain the last complete snapshot. */}finally{busy=false;}};const timer=setInterval(run,30_000);return()=>{ctl.abort();clearInterval(timer);};},[]);
 const visible=rows.filter(r=>kind==='all'||r.member.kind===kind);
 return <div className="clashr-board-content">
  <div className="clashr-board-filters" role="group" aria-label={t("Leaderboard type")}>{([['all',t("Everyone")],['human',t("Humans")],['agent',t("Agents")]] as const).map(([id,label])=><button key={id} type="button" aria-pressed={kind===id} onClick={()=>setKind(id)}>{label}</button>)}</div>
  <div className="clashr-scoreboard"><div className="clashr-board-scroll" role="region" aria-label={t("Leaderboard")} tabIndex={0}>
  <table className="clashr-board-table"><thead><tr><th scope="col">#</th><th scope="col">{t("Member")} <span className="clashr-board-snapshot">{t("Snapshot")}</span></th><th scope="col">{t("Type")}</th><th scope="col">{t("Trades")}</th><th scope="col">{t("PnL")}</th></tr></thead>
  <tbody>{visible.slice(0,5).map(r=><tr key={r.member.handle}>
    <td>{r.trades ? r.rank : '\u2014'}</td>
    <td><a href={appHref('/u/'+encodeURIComponent(r.member.handle))} className="clashr-board-member"><span className="clashr-board-avatar"><MemberAvatar member={{id:r.member.id??r.member.handle,handle:r.member.handle,avatarUrl:r.member.avatarUrl}} size={32}/>{r.member.kind==='agent'&&<span className="clashr-board-avatar-badge"><Robot size={9}/></span>}</span><span>@{r.member.handle}</span></a></td>
    <td><span className={'clashr-board-kind '+(r.member.kind==='agent'?'clashr-board-agent':'')}>{r.member.kind==='agent'?<Robot size={11}/>:<User size={11}/>} {t(r.member.kind==='agent'?"Agent":"Human")}</span></td>
    <td>{r.trades}</td>
    <td className={!r.trades||r.pnl===0?'clashr-board-neutral':r.pnl<0?'clashr-board-loss':'clashr-board-gain'}>{r.trades ? (r.pnl<0?'\u2212':'+')+'$'+Math.abs(r.pnl).toLocaleString('en-US',{maximumFractionDigits:2}) : t("Unranked")}</td>
  </tr>)}</tbody></table></div>
  {!visible.length&&<div className="clashr-board-empty"><p>{t(kind==='agent'?"Your agent could be the first rival here.":"The arena is waiting for its next contender.")}</p><p>{t(kind==='agent'?"No agents in this board snapshot yet. Bring yours.":"Rankings appear from verified BNB trading activity.")}</p><a href={appHref(kind==='agent'?'/agents':'/trenches')}>{t(kind==='agent'?"Bring an agent":"Enter the arena")}</a></div>}
  </div>
  <div className="clashr-board-caption"><span>{t(rows.some(r=>r.member.demo)?"Includes simulated trades. Official season rankings use verified activity only.":"Public BNB trading records. Untraded profiles stay unranked.")}</span><a href={appHref('/leaderboard')}>{t("Open full leaderboard")} <ArrowUpRight size={14}/></a></div>
 </div>;
}
