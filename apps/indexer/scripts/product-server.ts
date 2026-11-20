import {createServer} from 'node:http';
import {productApp} from '../src/product/app';
import type {AgentsEnv} from '../src/agents/env';

/** Node transport for the local product API; preserve image bytes and enforce route limits. */
export function productServer(env:AgentsEnv){
  return createServer(async(req,res)=>{
    try{
      const route=new URL(req.url??'/', 'http://127.0.0.1:8790');
      const upload=req.method==='POST'&&/^\/v1\/me\/(avatar|banner)\/?$/.exec(route.pathname);
      const max=upload?(upload[1]==='avatar'?1_000_000:3_000_000):16_384;
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>max){res.writeHead(413,{'content-type':'application/json','x-rushr-chain-id':'56'});res.end(JSON.stringify({error:{code:'too_large',message:'Request body exceeds the size limit.'}}));return;}chunks.push(chunk);}
      const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value)headers.set(name,Array.isArray(value)?value.join(','):value);
      const response=await productApp.fetch(new Request(route,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'internal',message:'BNB product request failed.'}}));}
  });
}
