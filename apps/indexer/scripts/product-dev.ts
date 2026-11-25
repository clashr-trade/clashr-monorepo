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
const server=productServer(env);
server.listen(8790,'127.0.0.1',()=>console.log('BNB product API http://127.0.0.1:8790'));
let syncing=false;
const sync=async()=>{if(syncing)return;syncing=true;try{const response=await productApp.fetch(new Request('http://127.0.0.1:8790/admin/sync-market',{method:'POST',headers:env.ADMIN_TOKEN?{authorization:'Bearer '+env.ADMIN_TOKEN}:undefined}),env);console.log('BNB metadata sync',response.status);}catch{console.log('BNB metadata sync unavailable');}finally{syncing=false;}};
setTimeout(()=>void sync(),5000);setInterval(()=>void sync(),60_000);
let recovering=false;
setInterval(async()=>{if(recovering)return;recovering=true;try{await productApp.fetch(new Request('http://127.0.0.1:8790/admin/recover-trades',{method:'POST',headers:env.ADMIN_TOKEN?{authorization:'Bearer '+env.ADMIN_TOKEN}:undefined}),env);}catch{console.log('BNB receipt recovery unavailable');}finally{recovering=false;}},15_000);
