import {Hono} from 'hono';
import type {Sql} from 'postgres';
import {db,publicCache,type Ctx} from '../agents/http';
import {DEMO_CONFIG_ID,demoPerformance,demoSummary,demoPnlHistory,type DemoAccount,type DemoData} from './demo-data';
export async function readDemoAccounts(sql:Sql):Promise<DemoAccount[]>{
 const [row]=await sql`select config from product_events where id=${DEMO_CONFIG_ID}`;
 if(row?.config?.version!==1||!Array.isArray(row.config.accounts))return [];
 const accounts=(row.config as DemoData).accounts;if(!accounts.length)return [];
 // A subsequently registered real member always owns their handle/wallet.
 const collisions=await sql`select handle,wallet from members where handle in ${sql(accounts.map(a=>a.member.handle))} or wallet in ${sql(accounts.map(a=>a.member.wallet))}`;
 return accounts.filter(a=>!collisions.some(m=>m.handle===a.member.handle||m.wallet===a.member.wallet));
}
export async function findDemoAccount(sql:Sql,ref:string):Promise<DemoAccount|undefined>{
 const key=ref.toLowerCase();
 const [row]=await sql`select entry as account from product_events e cross join lateral jsonb_array_elements(e.config->'accounts') entry
  where e.id=${DEMO_CONFIG_ID} and e.config->>'version'='1'
   and (entry->'member'->>'handle'=${key} or entry->'member'->>'id'=${key} or entry->'member'->>'wallet'=${key})
   and not exists(select 1 from members m where m.handle=entry->'member'->>'handle' or m.wallet=entry->'member'->>'wallet') limit 1`;
 return row?.account as DemoAccount|undefined;
}

const provenance={demo:true,provenance:'simulated'};
export const demoMembers=new Hono<Ctx>();
demoMembers.get('/demo/accounts',async(c,next)=>{
 if(c.env.CHAIN_ID!=='56')return next();
 const q=(c.req.query('q')??'').replace(/^@/,'').trim().toLowerCase(),kind=c.req.query('kind')??'all';
 const items=(await readDemoAccounts(c.var.sql)).filter(a=>(kind==='all'||a.member.kind===kind)&&(!q||a.member.handle.includes(q)||a.member.displayName.toLowerCase().includes(q))).map(a=>({member:a.member,summary:demoSummary(a),performance:demoPerformance(a)}));
 return c.json({...provenance,items},200,publicCache(15));
});
demoMembers.get('/members/:ref',async(c,next)=>{
 if(c.env.CHAIN_ID!=='56')return next();
 const account=await findDemoAccount(c.var.sql,c.req.param('ref'));if(!account)return next();
 return c.json({...provenance,member:account.member},200,publicCache(15));
});
demoMembers.get('/members/:ref/callouts',async(c,next)=>{
 if(c.env.CHAIN_ID!=='56')return next();
 if(!(await findDemoAccount(c.var.sql,c.req.param('ref'))))return next();return c.json({...provenance,items:[],next:null});
});
demoMembers.get('/members/:ref/rank',async(c,next)=>{
 if(c.env.CHAIN_ID!=='56')return next();
 if(!await findDemoAccount(c.var.sql,c.req.param('ref')))return next();return c.json({...provenance,rank:null,reason:'demo_profile'});
});
export const demoWallets=new Hono<Ctx>();
demoWallets.use('/wallets/*',db);
demoWallets.get('/wallets/:wallet/*',async(c,next)=>{
 if(c.env.CHAIN_ID!=='56')return next();
 const account=await findDemoAccount(c.var.sql,c.req.param('wallet'));if(!account)return next();
 const operation=c.req.path.split('/').slice(3).join('/');
 if(operation==='pnl')return c.json({...provenance,summary:demoSummary(account),positions:account.positions});
 if(operation==='pnl/history'){
  const range=c.req.query('range')??'7d';if(!['24h','7d','30d','all'].includes(range))return c.json({error:'invalid_range'},400);
  return c.json(demoPnlHistory(account,range));
 }
 if(operation==='trades'){
  const limit=Math.min(200,Math.max(1,Number(c.req.query('limit'))||50)),before=Number(c.req.query('before'))||Infinity;
  return c.json({...provenance,trades:account.trades.filter(t=>t.time<before).slice(0,limit),next:null});
 }
 if(operation.startsWith('positions/')){const position=account.positions.find(p=>p.token===operation.slice(10).toLowerCase());return position?c.json({...provenance,wallet:account.member.wallet,token:position.token,position,trades:account.trades.filter(t=>t.token===position.token)}):c.json({error:'not_found'},404);}
 if(operation==='holdings')return c.json({...provenance,items:[],next:null});
 return c.json({error:'demo_read_only'},404);
});
