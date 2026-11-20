import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {privateKeyToAccount} from 'viem/accounts';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import {localMedia} from '../scripts/local-media';
import {productServer} from '../scripts/product-server';
import {proxyProduct} from '../../web/lib/product-proxy';
import type {AgentsEnv} from '../src/agents/env';

const available=await pgAvailable();
describe.skipIf(!available)('local BNB profile media over HTTP',()=>{
  let db:Awaited<ReturnType<typeof freshDb>>,directory:string,server:ReturnType<typeof productServer>,base:string,session:string,memberId:string;
  const origin='http://localhost:3000';
  const call=async(path:string,method='GET',body?:unknown)=>{
    const response=await fetch(base+path,{method,headers:{origin,...(session?{authorization:`Bearer ${session}`}:{ }),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json() as any};
  };
  const web=async(parts:string[],method:string,body?:BodyInit)=>proxyProduct(new Request(`${origin}/api/product/${parts.join('/')}`,{method,headers:{origin,cookie:`rushr_bnb_session=${session}`,'content-type':method==='POST'?'image/png':'application/json'},body}),parts,base);
  beforeAll(async()=>{
    db=await freshDb('product_media');directory=await mkdtemp(join(tmpdir(),'clashr-media-'));
    for(const file of ['0001_bnb_product.sql','0002_receipt_recovery.sql'])await db.sql.unsafe(await readFile(new URL(`../../../packages/db/product/${file}`,import.meta.url),'utf8'));
    server=productServer({DATABASE_URL:db.url,CHAIN_ID:'56',PRODUCT_ORIGIN:origin,WEB_ORIGINS:origin,AGENTS_ENABLED:'1',MEDIA_UPLOADS_ENABLED:'1',MEDIA:localMedia(directory),IP_SALT:'media-fixture'} as unknown as AgentsEnv);
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const wallet=privateKeyToAccount('0x'+'34'.repeat(32) as `0x${string}`);
    const nonce=await call(`/v1/auth/wallet/nonce?address=${wallet.address}`);
    const signature=await wallet.signMessage({message:nonce.body.message});
    session=(await call('/v1/auth/wallet/verify','POST',{message:nonce.body.message,signature})).body.sessionToken;
    const registered=await call('/v1/me','POST',{handle:'media_fixture'});expect(registered.status).toBe(201);memberId=registered.body.member.id;
  });
  afterAll(async()=>{
    if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    if(directory)await rm(directory,{recursive:true,force:true});await db?.drop();
  });
  it.each(['avatar','banner'])('uploads, saves, serves and replaces a %s with persistent bytes',async kind=>{
    const bytes=new Uint8Array(kind==='avatar'?40_000:1_100_000).fill(255);bytes.set([137,80,78,71,13,10,26,10]);
    const up=await web(['v1','me',kind],'POST',bytes);expect(up.status).toBe(201);
    const uploaded=await up.json() as {url:string};expect(uploaded.url).toContain(`/api/product/v1/media/${kind}/${memberId}/`);
    const patch=await web(['v1','me'],'PATCH',JSON.stringify({[`${kind}Url`]:uploaded.url,displayName:'Media fixture'}));expect(patch.status).toBe(200);
    const saved=await call('/v1/me');expect(saved.body.member[`${kind}Url`]).toBe(uploaded.url);
    const image=await web(uploaded.url.replace('/api/product/','').split('/'),'GET');expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes);
    const key=uploaded.url.replace('/api/product/v1/media/','');
    expect(new Uint8Array((await localMedia(directory).get(key))!.body)).toEqual(bytes);
    const another=await web(['v1','me',kind],'POST',bytes);expect(another.status).toBe(201);
    expect(await localMedia(directory).get(key)).toBeNull();
    expect((await web(['v1','me'],'PATCH',JSON.stringify({[`${kind}Url`]:uploaded.url}))).status).toBe(422);
  });
});
