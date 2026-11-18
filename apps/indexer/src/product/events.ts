import {Hono} from 'hono';
import {rushStandings,type RushConfig} from '../agents/rush';
import {expensiveRead,fail,publicCache,type Ctx} from '../agents/http';
export function bnbEventConfig(value:unknown):RushConfig&{excludedWallets:string[];excludedHandles:string[]}{
  if(!value||typeof value!=='object')throw fail(503,'event_unconfigured','Configure the BNB event.');
  const raw=value as Record<string,unknown>,prizes=raw.prizes as Record<string,unknown>,rules=raw.rules as Record<string,unknown>;
  const startsAt=new Date(String(raw.startsAt)),endsAt=new Date(String(raw.endsAt));
  const positive=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1_000_000_000;
  if(typeof raw.id!=='string'||typeof raw.name!=='string'||!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||endsAt<=startsAt
    ||!prizes||!rules||![prizes.caller,prizes.gainer,prizes.trader,rules.minUsd,rules.minLiquidityUsd].every(positive))throw fail(503,'invalid_event','Invalid BNB event configuration.');
  const excludedWallets=raw.excludedWallets??[],excludedHandles=raw.excludedHandles??[];
  if(!Array.isArray(excludedWallets)||!excludedWallets.every(w=>typeof w==='string'&&/^0x[0-9a-f]{40}$/.test(w))
    ||!Array.isArray(excludedHandles)||!excludedHandles.every(h=>typeof h==='string'&&/^[a-z0-9_]{3,20}$/.test(h)))throw fail(503,'invalid_event','Invalid event exclusions.');
  return {id:raw.id,name:raw.name,startsAt,endsAt,prizes:prizes as RushConfig['prizes'],minUsd:rules.minUsd as number,minLiquidityUsd:rules.minLiquidityUsd as number,excludedWallets,excludedHandles};
}
export const productEvents=new Hono<Ctx>();
productEvents.get('/events/rush',async(c,next)=>{
  if(c.env.CHAIN_ID!=='56')return next();await expensiveRead(c);
  const [row]=await c.var.sql`select config from product_events where id='rush'`;
  if(!row)return c.json({event:null,standings:{caller:[],gainer:[],trader:[]},updatedAt:new Date(),chainId:56});
  const config=bnbEventConfig(row.config),result=await rushStandings(c.var.sql,new Date(),config,{wallets:config.excludedWallets,handles:config.excludedHandles});
  return c.json({chainId:56,event:{...config,status:result.status,poolUsd:config.prizes.caller+config.prizes.gainer+config.prizes.trader,rules:{minUsd:config.minUsd,minLiquidityUsd:config.minLiquidityUsd}},standings:result.standings,updatedAt:result.updatedAt},200,publicCache(30));
});
