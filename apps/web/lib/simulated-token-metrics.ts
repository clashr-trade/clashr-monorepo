import type {PublicBscToken} from './bsc-public-market';

/** Visual prototype only. Never persist, export as analysis, or pass to execution. */
export function simulatedTokenMetrics(token:PublicBscToken,now:number){
 const created=Date.parse(token.created_at);
 if(!Number.isFinite(created))return null;
 const age=Math.max(0,Math.floor((now-created)/60000));
 let seed=2166136261;
 for(const c of token.address+':'+age)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const pct=(value:number)=>Math.round(Math.min(100,Math.max(0,value))*10)/10;
 const cap=Number.isFinite(token.market_cap_usd)?Math.max(0,Math.min(1e9,token.market_cap_usd!)):3000;
 const holders=age===0?0:Math.max(1,Math.min(100000,Math.round(Math.sqrt(cap/1000)*12*Math.log2(2+age)*(.7+random()*.6))));
 return {metrics_simulated:true,holders,holders_known:true,
  top10_pct:age===0?0:pct(Math.max(15,90-Math.log2(age+1)*7)+random()*10),
  dev_pct:age===0?0:pct(random()*(age<10?18:12)),
  snipers_pct:age===0?0:pct(random()*(age<60?30:18)),
  insiders_pct:age===0?0:pct(random()*15),bundled_pct:age===0?0:pct(random()*20),
  fresh_pct:age===0?0:pct(Math.max(5,60-Math.log2(age+1)*6)+random()*12),
 };
}
