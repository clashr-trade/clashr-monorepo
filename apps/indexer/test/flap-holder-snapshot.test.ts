import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {decodeFunctionData,encodeFunctionResult,erc20Abi,type Hex} from 'viem';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import {snapshotFlapHolders} from '../src/bsc/flap-holder-snapshot';
import type {MarketRpc} from '../src/bsc/rpc';
const available=await pgAvailable(),token='0x'+'aa'.repeat(20),a='0x'+'bb'.repeat(20),b='0x'+'cc'.repeat(20),zero='0x'+'00'.repeat(20),hash=('0x'+'11'.repeat(32)) as Hex;
describe.skipIf(!available)('Chain-verified holder discovery',()=>{
 let db:Awaited<ReturnType<typeof freshDb>>;
 beforeAll(async()=>{db=await freshDb('flap_holder_snapshot');await db.sql`insert into chain_v2.flap_tokens(chain_id,address,name,symbol) values(56,${token},'Snapshot','SNAP')`;await db.sql`insert into chain_v2.flap_holder_watches(chain_id,address) values(56,${token})`;});
 afterAll(async()=>await db?.drop());
 const rpc:MarketRpc={chainId:async()=>56,header:async tag=>({number:typeof tag==='bigint'?tag:20n,hash,parentHash:hash,timestamp:1000}),logs:async()=>[],call:async(_to,data)=>{
  const decoded=decodeFunctionData({abi:erc20Abi,data});return decoded.functionName==='totalSupply'?encodeFunctionResult({abi:erc20Abi,functionName:'totalSupply',result:100n}):encodeFunctionResult({abi:erc20Abi,functionName:'balanceOf',result:String(decoded.args?.[0]).toLowerCase()===a?70n:30n});
 }};
 const history=(wallets:string[],pageKey?:string):typeof fetch=>async()=>Response.json({id:1,result:{transfers:wallets.map(to=>({from:zero,to,category:'erc20',blockNum:'0x14',rawContract:{address:token,value:'0xffff'}})),pageKey}});
 it('refuses discovery that omits a positive holder, without advancing a checkpoint',async()=>{
  expect(await snapshotFlapHolders(db.sql,rpc,'https://rpc.invalid',token,history([a]))).toBe(false);
  const [watch]=await db.sql`select complete,block from chain_v2.flap_holder_watches where address=${token}`;expect(watch).toMatchObject({complete:false,block:null});
 });
 it('uses actual pinned on-chain amounts, even if provider history has wrong amounts or extra pages',async()=>{
  expect(await snapshotFlapHolders(db.sql,rpc,'https://rpc.invalid',token,history([a,b],'more'))).toBe(true);
  const rows=await db.sql`select wallet,amount::text from chain_v2.flap_balances where token=${token} order by wallet`;expect(rows.map(r=>r.amount)).toEqual(['70','30']);
  const [watch]=await db.sql`select complete,block,block_hash from chain_v2.flap_holder_watches where address=${token}`;expect(watch).toMatchObject({complete:true,block:'20',block_hash:hash});
 });
 it('rejects noncanonical prior checkpoints and the wrong RPC chain',async()=>{
  await expect(snapshotFlapHolders(db.sql,{...rpc,header:async tag=>({...await rpc.header(tag),hash:('0x'+'22'.repeat(32)) as Hex})},'https://rpc.invalid',token,history([a,b]))).rejects.toThrow('checkpoint');
  await expect(snapshotFlapHolders(db.sql,{...rpc,chainId:async()=>1},'https://rpc.invalid',token,history([a,b]))).rejects.toThrow('chain');
 });
 it('leaves the verified snapshot intact when the optional provider method is unsupported',async()=>{
  expect(await snapshotFlapHolders(db.sql,rpc,'https://rpc.invalid',token,async()=>new Response('',{status:400}))).toBe(false);
  const [count]=await db.sql`select count(*)::int as n from chain_v2.flap_balances where token=${token}`;expect(count!.n).toBe(2);
 });
});
