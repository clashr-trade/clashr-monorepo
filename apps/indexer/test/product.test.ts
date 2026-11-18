import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {privateKeyToAccount} from 'viem/accounts';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import {productApp} from '../src/product/app';
import type {AgentsEnv} from '../src/agents/env';

const available=await pgAvailable();
describe.skipIf(!available)('independent BNB product: wallet sessions and original social API',()=>{
  let db:Awaited<ReturnType<typeof freshDb>>,env:AgentsEnv;
  const wallet=privateKeyToAccount('0x'+'12'.repeat(32) as `0x${string}`);
  const token='0x'+'ab'.repeat(20);
  const request=async(path:string,body?:unknown,session?:string)=>{
    const response=await productApp.fetch(new Request(`http://127.0.0.1:8790${path}`,{method:body?'POST':'GET',headers:{origin:'http://localhost:3000',...(body?{'content-type':'application/json'}:{}),...(session?{authorization:`Bearer ${session}`}:{})},body:body?JSON.stringify(body):undefined}),env);
    return {status:response.status,body:await response.json() as any,chain:response.headers.get('x-rushr-chain-id')};
  };
  beforeAll(async()=>{
    db=await freshDb('bnb_product');
    await db.sql.unsafe(await readFile(new URL('../../../packages/db/product/0001_bnb_product.sql',import.meta.url),'utf8'));
    await db.sql.unsafe(await readFile(new URL('../../../packages/db/product/0002_receipt_recovery.sql',import.meta.url),'utf8'));
    env={DATABASE_URL:db.url,CHAIN_ID:'56',PRODUCT_ORIGIN:'http://localhost:3000',WEB_ORIGINS:'http://localhost:3000',AGENTS_ENABLED:'1',LEADERBOARD_ENABLED:'1',AGENT_SIGNUP_ENABLED:'1',IP_SALT:'fixture-only'} as AgentsEnv;
    await db.sql`insert into tokens(address,name,symbol,decimals,total_supply,deployer,created_block,created_at,status) values(${token},'Fixture','FIX',18,'1000',${token},1,now(),'new')`;
  });
  afterAll(async()=>{await db?.drop();});
  it('requires a dedicated chain-56 database and rejects a Robinhood deployment',async()=>{
    expect((await request('/health')).body).toMatchObject({ok:true,chainId:56});
    const wrong=await productApp.fetch(new Request('http://localhost/health'),{...env,CHAIN_ID:'4663'});
    expect(wrong.status).toBe(503);
    expect((await request(`/wallets/${wallet.address}/pnl/history?range=7d`)).status).toBe(200);
    expect((await request(`/wallets/${wallet.address}/trades`)).status).toBe(200);
  });
  it('resolves dollar-prefixed tickers to an indexed BNB contract, without treating empty input as all tokens',async()=>{
    const result=await request('/search?q=%24fix');
    expect(result.status).toBe(200);expect(result.body.chainId).toBe(56);
    expect(result.body.tokens.map((t:{address:string})=>t.address)).toEqual([token]);
    expect((await request('/search?q=%24')).body.tokens).toEqual([]);
    expect((await request(`/search?q=${token}`)).body.tokens[0].address).toBe(token);
  });
  it('signs in with chain/domain-bound SIWE, consumes the nonce once, then runs onboarding and social writes',async()=>{
    const nonce=await request(`/v1/auth/wallet/nonce?address=${wallet.address}`);
    expect(nonce.status).toBe(200);expect(nonce.body.message).toContain('Chain ID: 56');expect(nonce.body.message).toContain('localhost:3000');
    const signature=await wallet.signMessage({message:nonce.body.message});
    const login=await request('/v1/auth/wallet/verify',{message:nonce.body.message,signature});
    expect(login.status).toBe(200);expect(login.body.sessionToken).toMatch(/^ws_[0-9a-f]{64}$/);
    const session=login.body.sessionToken;
    expect((await request('/v1/auth/wallet/verify',{message:nonce.body.message,signature})).status).toBe(401);
    expect((await request('/v1/me',undefined,session)).status).toBe(404);
    const member=await request('/v1/me',{handle:'bnb_human',displayName:'BNB fixture'},session);
    expect(member.status).toBe(201);expect(member.body.member.wallet).toBe(wallet.address.toLowerCase());
    const call=await request('/v1/callouts',{token,stance:'bullish',body:'A BNB-only fixture call'},session);
    expect(call.status).toBe(201);
    const feed=await request('/v1/feed');expect(feed.status).toBe(200);expect(JSON.stringify(feed.body)).toContain('A BNB-only fixture call');
    expect((await request('/v1/auth/wallet/logout',{},session)).status).toBe(200);
    expect((await request('/v1/me',undefined,session)).status).toBe(401);
  });
  it('rejects proofs for a different chain even when the same account signed',async()=>{
    const nonce=await request(`/v1/auth/wallet/nonce?address=${wallet.address}`);
    const message=nonce.body.message.replace('Chain ID: 56','Chain ID: 4663');
    const signature=await wallet.signMessage({message});
    expect((await request('/v1/auth/wallet/verify',{message,signature})).status).toBe(401);
  });
  it('discovers BNB members before trading and supports following, Following feed and unfollowing',async()=>{
    const login=async(account:ReturnType<typeof privateKeyToAccount>)=>{
      const nonce=await request(`/v1/auth/wallet/nonce?address=${account.address}`);
      const signature=await account.signMessage({message:nonce.body.message});
      const result=await request('/v1/auth/wallet/verify',{message:nonce.body.message,signature});
      expect(result.status).toBe(200);return result.body.sessionToken as string;
    };
    const ownerSession=await login(wallet);
    const otherWallet=privateKeyToAccount('0x'+'34'.repeat(32) as `0x${string}`);
    const otherSession=await login(otherWallet);
    const created=await request('/v1/me',{handle:'bnb_other',displayName:'Another BNB member'},otherSession);
    expect(created.status).toBe(201);
    const otherId=created.body.member.id;
    const discovered=await request('/v1/members/discover?q=%40bnb_other&kind=human');
    expect(discovered.status).toBe(200);
    expect(discovered.body.items).toEqual([expect.objectContaining({rank:null,pnl:null,score:null,member:expect.objectContaining({id:otherId})})]);
    const suggestions=await request('/v1/me/suggestions',undefined,ownerSession);
    expect(suggestions.body.items.some((s:any)=>s.member.id===otherId)).toBe(true);
    expect(suggestions.body.items.some((s:any)=>s.member.wallet===wallet.address.toLowerCase())).toBe(false);
    expect((await request(`/v1/follows/${otherId}`,{},ownerSession)).status).toBe(200);
    expect((await request('/v1/me/suggestions',undefined,ownerSession)).body.items.some((s:any)=>s.member.id===otherId)).toBe(false);
    const posted=await request('/v1/callouts',{token,stance:'bullish',body:'A call from the followed BNB member'},otherSession);
    expect(posted.status).toBe(201);
    expect((await request('/v1/me/feed',undefined,ownerSession)).body.items.some((c:any)=>c.id===posted.body.callout.id)).toBe(true);
    const unfollow=await productApp.fetch(new Request(`http://127.0.0.1:8790/v1/follows/${otherId}`,{method:'DELETE',headers:{origin:'http://localhost:3000',authorization:`Bearer ${ownerSession}`}}),env);
    expect(unfollow.status).toBe(200);
    expect((await request('/v1/me/feed',undefined,ownerSession)).body.items.some((c:any)=>c.id===posted.body.callout.id)).toBe(false);
    await db.sql`update members set status='suspended' where id=${otherId}`;
    expect((await request('/v1/members/discover?q=bnb_other')).body.items).toEqual([]);
  });
});
