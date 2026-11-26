/** Local BNB product server. Requires an explicitly initialized dedicated product database. */
import {fileURLToPath} from 'node:url';
import {productApp} from '../src/product/app';
import type {AgentsEnv} from '../src/agents/env';
import {localMedia} from './local-media';
import {productServer} from './product-server';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL to the dedicated BNB product database');
const env={...process.env,CHAIN_ID:'56',AGENTS_ENABLED:'1',LEADERBOARD_ENABLED:'1',AGENT_SIGNUP_ENABLED:'1',AGENT_TRADE_ENABLED:'1',
  MEDIA_UPLOADS_ENABLED:'1',MEDIA:localMedia(process.env.PRODUCT_MEDIA_DIR??fileURLToPath(new URL('../../../.local-media',import.meta.url))),
  PRODUCT_ORIGIN:process.env.PRODUCT_ORIGIN??'http://localhost:3000',
  // DEV_ALLOWED_ORIGIN: the web dev server reached by address (see apps/web/lib/dev-origin.ts). The SIWE domain stays PRODUCT_ORIGIN.
  WEB_ORIGINS:[process.env.PRODUCT_ORIGIN??'http://localhost:3000',process.env.DEV_ALLOWED_ORIGIN].filter(Boolean).join(',')} as unknown as AgentsEnv;
const port=Number(process.env.PORT??8790),host=process.env.PRODUCT_API_HOST??'127.0.0.1';
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid API PORT');
const server=productServer(env,{publicOnly:process.env.CLASHR_DEPLOYMENT==='railway'});
server.on('error',()=>{console.error('BNB product API could not listen on the configured host/port');process.exit(1);});
server.listen(port,host,()=>console.log(`BNB product API listening on ${host}:${port}`));
let syncing=false;
const sync=async()=>{if(syncing)return;syncing=true;try{const response=await productApp.fetch(new Request('http://127.0.0.1:8790/admin/sync-market',{method:'POST',headers:env.ADMIN_TOKEN?{authorization:'Bearer '+env.ADMIN_TOKEN}:undefined}),env);console.log('BNB metadata sync',response.status);}catch{console.log('BNB metadata sync unavailable');}finally{syncing=false;}};
const firstSync=setTimeout(()=>void sync(),5000),syncTimer=setInterval(()=>void sync(),60_000);
let recovering=false;
const recoveryTimer=setInterval(async()=>{if(recovering)return;recovering=true;try{await productApp.fetch(new Request('http://127.0.0.1:8790/admin/recover-trades',{method:'POST',headers:env.ADMIN_TOKEN?{authorization:'Bearer '+env.ADMIN_TOKEN}:undefined}),env);}catch{console.log('BNB receipt recovery unavailable');}finally{recovering=false;}},15_000);
const stop=()=>{clearTimeout(firstSync);clearInterval(syncTimer);clearInterval(recoveryTimer);server.close(()=>process.exit(0));};
process.once('SIGTERM',stop);process.once('SIGINT',stop);
