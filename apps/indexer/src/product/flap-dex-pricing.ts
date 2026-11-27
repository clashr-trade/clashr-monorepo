/** Indicative migrated-token display data only. Never used to quote or execute a trade. */
import {createPublicClient,http,parseAbi,type Address} from 'viem';
import {bsc} from 'viem/chains';
import {BSC_PANCAKE,PANCAKE_V2} from '@clashr/core/chain/pancake';
export type MigratedDisplay={priceUsd:number;liquidityUsd:number;volume24hUsd:number|null;pool:string;at:string;source:'dexscreener-indicative'|'pancake-v2-onchain-indicative'};
type Spec={token:string;pool?:string|null;decimals?:number;quote?:{address:string;decimals:number;usd:number}};
const valid=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v);
const finite=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const memo=new Map<string,{until:number;value:MigratedDisplay|null}>();
let pending:Promise<void>|null=null;
const key=(s:Spec)=>s.token.toLowerCase()+':'+(valid(s.pool)?s.pool.toLowerCase():'');
const poolAbi=parseAbi(['function factory() view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)']);
export function reserveDisplay(tokenReserve:bigint,quoteReserve:bigint,tokenDecimals:number,quoteDecimals:number,quoteUsd:number){
 if(tokenReserve<=0n||quoteReserve<=0n||![tokenDecimals,quoteDecimals].every(n=>Number.isInteger(n)&&n>=0&&n<=36)||!Number.isFinite(quoteUsd)||quoteUsd<=0)return null;
 const priceUsd=Number(quoteReserve)/Number(tokenReserve)*10**(tokenDecimals-quoteDecimals)*quoteUsd,liquidityUsd=2*Number(quoteReserve)/10**quoteDecimals*quoteUsd;
 return Number.isFinite(priceUsd)&&priceUsd>0&&Number.isFinite(liquidityUsd)&&liquidityUsd>0?{priceUsd,liquidityUsd}:null;
}
async function fromReserves(spec:Spec,rpcUrl:string):Promise<MigratedDisplay|null>{
 if(!valid(spec.pool)||!spec.quote||!valid(spec.quote.address)||spec.decimals==null)return null;
 try{
  const client=createPublicClient({chain:bsc,transport:http(rpcUrl,{timeout:1500,retryCount:0})});
  if(await client.getChainId()!==56)return null;
  const block=await client.getBlock({blockTag:'finalized'}),pool=spec.pool as Address;
  const [factory,t0,t1,reserves]=await client.multicall({allowFailure:false,blockNumber:block.number,contracts:[
   {address:pool,abi:poolAbi,functionName:'factory'},{address:pool,abi:poolAbi,functionName:'token0'},
   {address:pool,abi:poolAbi,functionName:'token1'},{address:pool,abi:poolAbi,functionName:'getReserves'},
  ]});
  if(factory.toLowerCase()!==BSC_PANCAKE.v2Factory)return null;
  const first=t0.toLowerCase()===spec.token.toLowerCase(),other=first?t1:t0;
  if((!first&&t1.toLowerCase()!==spec.token.toLowerCase())||other.toLowerCase()!==spec.quote.address.toLowerCase())return null;
  const canonical=await client.readContract({address:BSC_PANCAKE.v2Factory,abi:PANCAKE_V2,functionName:'getPair',args:[t0,t1],blockNumber:block.number});
  if(canonical.toLowerCase()!==pool.toLowerCase())return null;
  const value=reserveDisplay(reserves[first?0:1],reserves[first?1:0],spec.decimals,spec.quote.decimals,spec.quote.usd);
  if(!value)return null;
  return {...value,volume24hUsd:null,pool:pool.toLowerCase(),at:new Date(Number(block.timestamp)*1000).toISOString(),source:'pancake-v2-onchain-indicative'};
 }catch{return null;}
}
export async function migratedDisplayQuotes(specs:Spec[],fetcher:typeof fetch=fetch,rpcUrl?:string):Promise<Map<string,MigratedDisplay>>{
 const wanted=specs.filter(s=>valid(s.token)).slice(0,50);
 if(fetcher===fetch&&pending)await pending;
 const missing=fetcher===fetch?wanted.filter(s=>(memo.get(key(s))?.until??0)<=Date.now()):wanted;
 const found=new Map<string,MigratedDisplay>();
 const load=async()=>{
  let fallbackBudget=2;
  for(let i=0;i<missing.length;i+=30){
   const batch=missing.slice(i,i+30);
   let pairs:unknown=[];
   try{const r=await fetcher('https://api.dexscreener.com/tokens/v1/bsc/'+batch.map(s=>s.token.toLowerCase()).join(','),{signal:AbortSignal.timeout(5000)});if(r.ok)pairs=await r.json();}catch{/* Keep unavailable prices unknown. */}
   for(const spec of batch){
    const rows=(Array.isArray(pairs)?pairs:[]).filter(p=>p&&p.chainId==='bsc'&&typeof p.dexId==='string'&&p.dexId.toLowerCase().startsWith('pancakeswap')
     &&valid(p.baseToken?.address)&&p.baseToken.address.toLowerCase()===spec.token.toLowerCase()&&valid(p.pairAddress)
     &&(!valid(spec.pool)||/^0x0{40}$/i.test(spec.pool)||p.pairAddress.toLowerCase()===spec.pool.toLowerCase())
     &&(finite(p.priceUsd)??0)>0&&(finite(p.liquidity?.usd)??0)>0).sort((a,b)=>Number(b.liquidity.usd)-Number(a.liquidity.usd));
    const p=rows[0];let value:MigratedDisplay|null=p?{priceUsd:Number(p.priceUsd),liquidityUsd:Number(p.liquidity.usd),volume24hUsd:finite(p.volume?.h24),pool:p.pairAddress.toLowerCase(),at:new Date().toISOString(),source:'dexscreener-indicative'}:null;
    if(!value&&rpcUrl&&fallbackBudget-->0)value=await fromReserves(spec,rpcUrl);
    if(value)found.set(spec.token.toLowerCase(),value);
    if(fetcher===fetch){if(memo.size>=256)memo.delete(memo.keys().next().value!);memo.set(key(spec),{until:Date.now()+(value?60000:10000),value});}
   }
  }
 };
 if(fetcher===fetch){pending=load().finally(()=>{pending=null;});await pending;}else await load();
 for(const spec of wanted){const value=fetcher===fetch?memo.get(key(spec))?.value:found.get(spec.token.toLowerCase());if(value)found.set(spec.token.toLowerCase(),value);}
 return found;
}
