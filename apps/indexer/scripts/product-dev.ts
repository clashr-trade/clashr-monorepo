/** Local BNB product server. Requires an explicitly initialized dedicated product database. */
import {createServer} from 'node:http';
import {productApp} from '../src/product/app';
import type {AgentsEnv} from '../src/agents/env';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL to the dedicated BNB product database');
const env={...process.env,CHAIN_ID:'56',AGENTS_ENABLED:'1',LEADERBOARD_ENABLED:'1',AGENT_SIGNUP_ENABLED:'1',AGENT_TRADE_ENABLED:'1',
  PRODUCT_ORIGIN:process.env.PRODUCT_ORIGIN??'http://localhost:3000',WEB_ORIGINS:process.env.PRODUCT_ORIGIN??'http://localhost:3000'} as unknown as AgentsEnv;
const server=createServer(async(req,res)=>{
  try {
    const chunks:Buffer[]=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>16_384){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value)headers.set(name,Array.isArray(value)?value.join(','):value);
    const response=await productApp.fetch(new Request(`http://127.0.0.1:8790${req.url}`,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),env);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'internal',message:'BNB product request failed.'}}));}
});
server.listen(8790,'127.0.0.1',()=>console.log('BNB product API http://127.0.0.1:8790'));
let syncing=false;
const sync=async()=>{if(syncing)return;syncing=true;try{const response=await productApp.fetch(new Request('http://127.0.0.1:8790/admin/sync-market',{method:'POST'}),env);console.log('BNB metadata sync',response.status);}catch{console.log('BNB metadata sync unavailable');}finally{syncing=false;}};
setTimeout(()=>void sync(),5000);setInterval(()=>void sync(),60_000);
let recovering=false;
setInterval(async()=>{if(recovering)return;recovering=true;try{await productApp.fetch(new Request('http://127.0.0.1:8790/admin/recover-trades',{method:'POST'}),env);}catch{console.log('BNB receipt recovery unavailable');}finally{recovering=false;}},15_000);
