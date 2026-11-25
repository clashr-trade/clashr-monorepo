import {sha256,stringToHex} from 'viem';
/** Fictional, read-only portfolios. Never insert these into members, swaps or financial ledgers. */
export const DEMO_CONFIG_ID='demo-accounts';
const DAY=86400000;
const HUMAN_NAMES=[['maya_chen','Maya Chen'],['noah_flow','Noah Park'],['lena_swings','Lena Brooks'],['kai_tan','Kai Tan'],['sofia_chain','Sofia Reyes'],['ethan_wu','Ethan Wu'],['aria_levels','Aria Patel'],['lucas_vault','Lucas Meyer'],['nina_scalps','Nina Torres'],['owen_chart','Owen Reed'],['mei_momentum','Mei Lin'],['leo_ranges','Leo Martins'],['sana_trades','Sana Ahmed'],['alex_river','Alex Rivera']] as const;
const AGENT_NAMES=[['kestrel_signal','Kestrel'],['atlas_grid','Atlas Grid'],['juniper_quant','Juniper'],['circuit_finch','Circuit Finch'],['orion_scout','Orion Scout'],['meridian_flow','Meridian'],['aster_alpha','Aster']] as const;
// Metadata: https://tokens.pancakeswap.finance/pancakeswap-extended.json (BNB chain 56).
// Prices below are illustrative fixture inputs, never market quotes.
const TOKENS=[
 {address:'0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',symbol:'CAKE',name:'PancakeSwap',price:2.8},
 {address:'0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',symbol:'WBNB',name:'Wrapped BNB',price:650},
 {address:'0xe02df9e3e622debdd69fb838bb799e3f168902c5',symbol:'BAKE',name:'Bakery Token',price:.18},
 {address:'0x965f527d9159dce6288a2219db51fc6eef120dd1',symbol:'BSW',name:'Biswap',price:.045},
 {address:'0x67ee3cb086f8a16f34bee3ca72fad36f7db929e2',symbol:'DODO',name:'DODO',price:.12},
 {address:'0xd41fdb03ba84762dd66a0af1a6c8540ff1ba5dfb',symbol:'SFP',name:'SafePal',price:.62},
 {address:'0x4b0f1812e5df2a09796481ff14017e6005508003',symbol:'TWT',name:'Trust Wallet Token',price:1.1},
 {address:'0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63',symbol:'XVS',name:'Venus',price:7.5},
 {address:'0x8f0528ce5ef7b51152a59745befdd91d97091d2f',symbol:'ALPACA',name:'Alpaca',price:.14},
] as const;
const dollars=(c:number)=>c/100;
export function makeDemoAccounts(at=new Date()){
 const anchor=at.getTime();if(!Number.isFinite(anchor))throw new Error('Invalid demo anchor');
 const all=[...HUMAN_NAMES,...AGENT_NAMES];
 return {version:1,provenance:'simulated',generatedAt:at.toISOString(),accounts:all.map(([handle,displayName],index)=>{
  const kind=index<14?'human' as const:'agent' as const,id='clashr-example-'+handle;
  // Stable placeholder address only: no private key or wallet ownership is implied.
  const wallet='0x'+sha256(stringToHex('clashr-educational-profile:'+handle)).slice(-40);
  // Rotate both the held asset and the secondary traded asset: all 21 pairs differ.
  const first=index%TOKENS.length,second=(first+1+Math.floor(index/TOKENS.length))%TOKENS.length;
  const assets=[TOKENS[first]!,TOKENS[second]!] as const;
  const positions=assets.map(t=>({token:t.address,symbol:t.symbol,name:t.name,image_url:null,price_usd:Number(t.price),decimals:18,bought_usd:0,sold_usd:0,buys:0,sells:0,held_tokens:'0',cost_basis_usd:0,realized_usd:0,unrealized_usd:0,first_trade_at:null as string|null,last_trade_at:null as string|null}));
  const books=assets.map(()=>({quantity:0,cost:0,bought:0,sold:0,realized:0}));
  const trades:{tx:string;logIndex:number;time:number;token:string;symbol:string;imageUrl:null;side:'buy'|'sell';usd:number;priceUsd:number;mcapUsd:null;realizedUsd:number|null;demo:true}[]=[];
  let cash=200000+index*27500;
  const add=(asset:number,side:'buy'|'sell',cents:number,quantity:number,time:number)=>{
   const b=books[asset]!,p=positions[asset]!,date=new Date(time).toISOString();let result:number|null=null;
   if(side==='buy'){b.quantity+=quantity;b.cost+=cents;b.bought+=cents;cash-=cents;p.buys++;}
   else{if(quantity>b.quantity)throw new Error('Demo oversell');const cost=quantity===b.quantity?b.cost:Math.round(b.cost*quantity/b.quantity);b.quantity-=quantity;b.cost-=cost;b.sold+=cents;result=cents-cost;b.realized+=result;cash+=cents;p.sells++;}
   p.first_trade_at??=date;p.last_trade_at=date;
   trades.push({tx:'simulated-'+handle+'-'+trades.length,logIndex:trades.length,time:Math.floor(time/1000),token:p.token,symbol:p.symbol,imageUrl:null,side,usd:dollars(cents),priceUsd:dollars(cents)/(quantity/1e6),mcapUsd:null,realizedUsd:result===null?null:dollars(result),demo:true});
  };
  // 16 of 21 portfolios lose money (76.2%, closest whole-account count to 75%).
  const losing=index%4!==3;
  const cycles=1+index%2;
  for(let cycle=0;cycle<cycles;cycle++)for(let asset=0;asset<assets.length;asset++){
   const cost=1500+((index*1771+cycle*3701+asset*4300)%4500),quantity=Math.round(dollars(cost)/assets[asset]!.price*1e6);
   const factor=losing?(asset===0?-.06-(index%4)*.01:.005):.015+(index%3)*.01;
   const sell=Math.round(cost*(1+factor)),start=anchor-26*DAY+cycle*(24*DAY/cycles)+asset*3600000;
   add(asset,'buy',cost,quantity,start);add(asset,'sell',sell,quantity,start+(3+index%18)*3600000);
  }
  const cost=4000+index*200,quantity=Math.round(dollars(cost)/assets[0].price*1e6);
  add(0,'buy',cost,quantity,anchor-3*3600000);
  add(0,'sell',Math.round(cost*.4*(1+(losing?-.03:.025))),Math.floor(quantity*.4),anchor-1800000);
  const heldPrice=assets[0].price*(1+(losing?-.025:.02));positions[0]!.price_usd=heldPrice;
  for(let a=0;a<positions.length;a++){const p=positions[a]!,b=books[a]!;Object.assign(p,{bought_usd:dollars(b.bought),sold_usd:dollars(b.sold),held_tokens:(BigInt(b.quantity)*1000000000000n).toString(),cost_basis_usd:dollars(b.cost),realized_usd:dollars(b.realized),unrealized_usd:dollars(Math.round(b.quantity/1e6*p.price_usd*100)-b.cost)});}
  trades.sort((a,b)=>b.time-a.time||b.logIndex-a.logIndex);
  const realized=(days:number)=>Math.round(trades.filter(t=>t.time*1000>=anchor-days*DAY).reduce((n,t)=>n+(t.realizedUsd??0)*100,0))/100;
  const realizedTotal=dollars(books.reduce((n,b)=>n+b.realized,0)),sells=trades.filter(t=>t.side==='sell');
  if(cash<0)throw new Error('Negative demo cash');
  const summary={realized_usd:realizedTotal,unrealized_usd:positions.reduce((n,p)=>n+p.unrealized_usd,0),realized_24h_usd:realized(1),realized_7d_usd:realized(7),realized_30d_usd:realized(30),volume_usd:dollars(books.reduce((n,b)=>n+b.bought+b.sold,0)),trades:trades.length,tokens_traded:positions.length,win_rate:sells.filter(t=>(t.realizedUsd??0)>0).length/sells.length*100,best_trade_usd:Math.max(...sells.map(t=>t.realizedUsd??0)),last_trade_at:new Date(trades[0]!.time*1000).toISOString(),portfolio_value_usd:dollars(cash)+positions.reduce((n,p)=>n+p.cost_basis_usd+p.unrealized_usd,0),simulated_cash_usd:dollars(cash)};
  const owner=index>=14?{id:'clashr-example-'+HUMAN_NAMES[index-14]![0],handle:HUMAN_NAMES[index-14]![0]}:null;
  return {member:{id,handle,displayName,kind,wallet,bio:kind==='human'?'Fictional BNB trader exploring market structure, position sizing and risk.':'Fictional strategy agent monitoring BNB momentum and managing position risk.',avatarUrl:null,bannerUrl:null,x:null,owner,followers:0,following:0,createdAt:new Date(anchor-32*DAY-index*DAY).toISOString(),demo:true,agents:index<7?[{id:'clashr-example-'+AGENT_NAMES[index]![0],handle:AGENT_NAMES[index]![0]}]:[],callouts:0},summary,positions,trades};
 })};
}
export type DemoData=ReturnType<typeof makeDemoAccounts>;
export type DemoAccount=DemoData['accounts'][number];
export function demoPnlHistory(account:DemoAccount,range:string,now=Date.now()){
 const days:Record<string,number>={'24h':1,'7d':7,'30d':30};
 const from=range==='all'?null:Math.floor((now-(days[range]??7)*DAY)/1000);
 const sells=account.trades.filter(t=>t.side==='sell'&&(from===null||t.time>=from)&&t.time<=now/1000).sort((a,b)=>a.time-b.time||a.logIndex-b.logIndex);
 let cents=0;const points=[{t:from??Math.min(...account.trades.map(t=>t.time))-1,pnl:0}];
 for(const t of sells){cents+=Math.round((t.realizedUsd??0)*100);points.push({t:t.time,pnl:dollars(cents)});}
 return {demo:true,provenance:'simulated',range,from,realizedUsd:dollars(cents),sells:sells.length,points};
}

export function demoSummary(account:DemoAccount,now=Date.now()){
 const rolling=(days:number)=>account.trades.filter(t=>t.time*1000>=now-days*DAY&&t.time*1000<=now).reduce((sum,t)=>sum+Math.round((t.realizedUsd??0)*100),0)/100;
 return {...account.summary,realized_24h_usd:rolling(1),realized_7d_usd:rolling(7),realized_30d_usd:rolling(30)};
}

/** Realized performance for each rolling window, derived from stored trades. */
export function demoPerformance(account:DemoAccount,now=Date.now()){
 const windowStats=(days:number)=>{
  const trades=account.trades.filter(t=>t.time*1000>=now-days*DAY&&t.time*1000<=now);
  const sells=trades.filter(t=>t.side==='sell');
  const cents=(value:number)=>Math.round(value*100);
  const realized=sells.reduce((sum,t)=>sum+cents(t.realizedUsd??0),0);
  const soldCost=sells.reduce((sum,t)=>sum+cents(t.usd)-cents(t.realizedUsd??0),0);
  const outcomes=new Map<string,number>();
  for(const t of sells)outcomes.set(t.token,(outcomes.get(t.token)??0)+cents(t.realizedUsd??0));
  return {roi:soldCost>0?realized/soldCost:null,winRate:outcomes.size?[...outcomes.values()].filter(p=>p>0).length/outcomes.size:null,trades:trades.length,tokens:new Set(trades.map(t=>t.token)).size,volumeUsd:trades.reduce((sum,t)=>sum+cents(t.usd),0)/100};
 };
 return {'24h':windowStats(1),'7d':windowStats(7),'30d':windowStats(30)};
}
