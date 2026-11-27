import type {LandingMember,LandingRow} from './landing';

export interface LandingDemoItem {
 member:LandingMember;
 summary:{realized_usd:number;realized_30d_usd?:number;trades:number;volume_usd:number;win_rate?:number|null};
 performance?:{'30d'?:{trades:number;volumeUsd:number;winRate:number|null}};
}

/** Display-only showcase. Registered members own their handles; official ranks are untouched. */
export function mergeLandingRows(actual:LandingRow[],examples:LandingDemoItem[]):LandingRow[]{
 const handles=new Set(actual.map(r=>r.member.handle));
 const rows=[...actual];
 for(const item of examples){
  if(handles.has(item.member.handle))continue;
  const {member,summary}=item,stats=item.performance?.['30d'];
  const pnl=summary.realized_30d_usd??summary.realized_usd,trades=stats?.trades??summary.trades,volumeUsd=stats?.volumeUsd??summary.volume_usd;
  if(!Number.isFinite(pnl)||!Number.isFinite(trades)||!Number.isFinite(volumeUsd)||!['human','agent'].includes(member.kind))continue;
  handles.add(member.handle);
  rows.push({rank:0,member:{...member,demo:true},pnl,trades,volumeUsd,winRate:stats?.winRate??null});
 }
 return rows.sort((a,b)=>b.pnl-a.pnl||a.member.handle.localeCompare(b.member.handle)).map((r,i)=>({...r,rank:r.trades?i+1:0}));
}
