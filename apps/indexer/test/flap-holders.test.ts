import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {encodeEventTopics,encodeAbiParameters,encodeFunctionResult,erc20Abi,parseAbi,type Hex} from 'viem';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import {advanceFlapHolders} from '../src/bsc/flap-holders';
import type {MarketRpc,MarketLog} from '../src/bsc/rpc';
const available=await pgAvailable(),tokenA='0x'+'aa'.repeat(20),tokenB='0x'+'bb'.repeat(20),wallet='0x'+'cc'.repeat(20),other='0x'+'dd'.repeat(20),zero='0x'+'00'.repeat(20);
const hash=(n:bigint)=>('0x'+n.toString(16).padStart(64,'0')) as Hex;
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const log=(token:string,block:bigint,from:string,to:string,value:bigint):MarketLog=>({address:token as Hex,blockNumber:`0x${block.toString(16)}`,blockHash:hash(block),transactionHash:hash(block+(token===tokenA?100n:200n)),logIndex:'0x0',topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:from as Hex,to:to as Hex}}) as Hex[],data:encodeAbiParameters([{type:'uint256'}],[value])});
describe.skipIf(!available)('Batched contiguous holder logs',()=>{
 let db:Awaited<ReturnType<typeof freshDb>>;
 beforeAll(async()=>{
  db=await freshDb('flap_holders_batch');
  for(const token of [tokenA,tokenB])await db.sql`insert into chain_v2.flap_tokens(chain_id,address,created_block,name,symbol,state_block) values(56,${token},10,'batch','BATCH',14)`;
  await db.sql`insert into chain_v2.flap_holder_watches(chain_id,address,block,block_hash) values(56,${tokenA},null,null),(56,${tokenB},11,${hash(11n)})`;
  await db.sql`insert into chain_v2.flap_balances(chain_id,token,wallet,amount) values(56,${tokenB},${wallet},100)`;
 });
 afterAll(async()=>await db?.drop());
 it('shares log filters and skips each newer watch prefix without double counting',async()=>{
  let calls=0;
  const rpc:MarketRpc={chainId:async()=>56,header:async tag=>{const n=typeof tag==='bigint'?tag:14n;return {number:n,hash:hash(n),parentHash:hash(n-1n),timestamp:1000};},logs:async(_from,_to,addresses)=>{calls++;expect(addresses).toHaveLength(2);return [log(tokenA,10n,zero,wallet,100n),log(tokenB,10n,zero,wallet,100n),log(tokenA,12n,wallet,other,20n),log(tokenB,12n,wallet,other,30n)];},call:async()=>encodeFunctionResult({abi:erc20Abi,functionName:'totalSupply',result:100n})};
  const watches=[{address:tokenA,created_block:'10',block:null,block_hash:null},{address:tokenB,created_block:'10',block:'11',block_hash:hash(11n)}];
  expect(await advanceFlapHolders(db.sql,rpc,watches,100n,0)).toBe(2);expect(calls).toBe(1);
  const rows=await db.sql`select token,wallet,amount::text from chain_v2.flap_balances order by token,wallet`;expect(rows.map(r=>r.amount)).toEqual(['80','20','70','30']);
  // A stale overlapping worker must not apply the same deltas twice.
  expect(await advanceFlapHolders(db.sql,rpc,watches,100n,0)).toBe(0);
 });
});
