import { Hono } from 'hono';
import postgres from 'postgres';
import { v1 } from '../agents/app';
import type { AgentsEnv } from '../agents/env';
import { dbUrl } from '../env';
import {syncProductMarket} from './market';
import {recoverProductTrades} from './trade';
import {demoWallets} from './demo';
import {productWallets} from './wallets';
import {flapMarket,flapTrades,flapHolders} from './flap';

export const productApp = new Hono<{Bindings:AgentsEnv}>();
productApp.use('*',async(c,next)=>{
  if(c.env.CHAIN_ID!=='56')return c.json({error:{code:'wrong_chain',message:'BNB product requires chain 56.'}},503);
  const sql=postgres(dbUrl(c.env),{max:1,prepare:false,fetch_types:false});
  try {
    const [row]=await sql`select chain_id,halted from product_config where singleton=true`;
    if(row?.chain_id!==56||row.halted)throw new Error('Wrong or halted product database');
  } catch { return c.json({error:{code:'database_not_ready',message:'Dedicated BNB product database is not initialized.'}},503); }
  finally {await sql.end({timeout:2});}
  await next();
  c.header('x-clashr-chain-id','56');
  c.header('x-rushr-chain-id','56'); // Compatibility for existing clients.
});
productApp.get('/health',c=>c.json({ok:true,chainId:56,product:'bnb'}));
productApp.get('/flap/holders',async c=>{
 const address=c.req.query('address')??'';
 if(!/^0x[0-9a-f]{40}$/.test(address))return c.json({error:'invalid_address'},400);
 const sql=postgres(c.env.BSC_INDEX_DATABASE_URL??dbUrl(c.env),{max:1,prepare:false,fetch_types:false});
 try{return c.json({chainId:56,...await flapHolders(sql,address)});}
 catch{return c.json({error:'flap_holders_unavailable'},503);}
 finally{await sql.end({timeout:2});}
});
productApp.get('/flap/trades',async c=>{
 const address=c.req.query('address')??'';
 if(!/^0x[0-9a-f]{40}$/.test(address))return c.json({error:'invalid_address'},400);
 const sql=postgres(c.env.BSC_INDEX_DATABASE_URL??dbUrl(c.env),{max:1,prepare:false,fetch_types:false});
 try{return c.json({chainId:56,trades:await flapTrades(sql,address,c.env.BSC_RPC_URL)});}
 catch{return c.json({error:'flap_index_not_ready'},503);}
 finally{await sql.end({timeout:2});}
});
productApp.get('/flap/market',async c=>{
 const address=c.req.query('address');
 if(address&&!/^0x[0-9a-f]{40}$/.test(address))return c.json({error:'invalid_address'},400);
 const sql=postgres(c.env.BSC_INDEX_DATABASE_URL??dbUrl(c.env),{max:1,prepare:false,fetch_types:false});
 try{return c.json(await flapMarket(sql,address,c.env.BSC_RPC_URL));}
 catch{return c.json({error:'flap_index_not_ready'},503);}
 finally{await sql.end({timeout:2});}
});
productApp.post('/admin/sync-market',async c=>{
  const host=new URL(c.req.url).hostname;
  if(c.env.ADMIN_TOKEN?c.req.header('authorization')!==`Bearer ${c.env.ADMIN_TOKEN}`:!['127.0.0.1','localhost'].includes(host))return c.json({error:'unauthorized'},401);
  const sql=postgres(dbUrl(c.env),{max:1,prepare:false,fetch_types:false});
  try{return c.json(await syncProductMarket(sql,c.env.PRODUCT_MARKET_ORIGIN??c.env.PRODUCT_ORIGIN!,c.env.BSC_RPC_URL));}
  catch{return c.json({error:'market_sync_unavailable'},503);}
  finally{await sql.end({timeout:2});}
});
productApp.post('/admin/recover-trades',async c=>{
  const host=new URL(c.req.url).hostname;
  if(c.env.ADMIN_TOKEN?c.req.header('authorization')!==`Bearer ${c.env.ADMIN_TOKEN}`:!['127.0.0.1','localhost'].includes(host))return c.json({error:'unauthorized'},401);
  const sql=postgres(dbUrl(c.env),{max:1,prepare:false,fetch_types:false});
  try{return c.json(await recoverProductTrades(sql,c.env.BSC_RPC_URL));}finally{await sql.end({timeout:2});}
});
// A dedicated deployment reuses the audited social/member implementation and its SQL isolation.
// RPC-backed legacy handlers must be replaced or explicitly refused before mounting /v1.
productApp.use('/v1/*',async(c,next)=>{
  if (/\/agents\/me\/fees$/.test(c.req.path)) {
    return c.json({error:{code:'bnb_adapter_required',message:'Use the verified BNB wallet adapter for this operation.'}},503);
  }
  await next();
});
productApp.get('/search',async c=>{
  const q=(c.req.query('q')??'').trim().replace(/^\$+\s*/, '').trim().slice(0,100);
  if(q.length<2)return c.json({chainId:56,tokens:[]});
  const sql=postgres(dbUrl(c.env),{max:1,prepare:false,fetch_types:false});
  try {const tokens=await sql`select *,56 as chain_id from tokens where address=${q.toLowerCase()} or symbol ilike ${`%${q}%`} or name ilike ${`%${q}%`} order by volume_24h_usd desc nulls last limit 20`;return c.json({chainId:56,tokens});}
  finally {await sql.end({timeout:2});}
});
productApp.route('/',demoWallets);
productApp.route('/',productWallets);
productApp.route('/v1',v1);
