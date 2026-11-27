import {it,expect,vi} from 'vitest';
import {encodeAbiParameters,encodeEventTopics} from 'viem';
import type {Sql} from 'postgres';
import type {MarketLog,MarketRpc} from '../src/bsc/rpc';
import {FLAP_EVENTS,FLAP_PORTAL,projectFlap} from '../src/bsc/flap';
import {recoverFlapLaunch} from '../src/bsc/flap-launch-history';
vi.mock('../src/bsc/flap',async original=>({...await original<typeof import('../src/bsc/flap')>(),projectFlap:vi.fn(async()=>({launches:1,trades:0}))}));
const token='0x'+'aa'.repeat(20),creator='0x'+'bb'.repeat(20),hash=('0x'+'11'.repeat(32)) as `0x${string}`;
const log:MarketLog={address:FLAP_PORTAL,blockNumber:'0xa',blockHash:hash,transactionHash:hash,logIndex:'0x0',topics:encodeEventTopics({abi:FLAP_EVENTS,eventName:'TokenCreated'}),data:encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'address'},{type:'string'},{type:'string'},{type:'string'}],[1000n,creator as `0x${string}`,1n,token as `0x${string}`,'Old','OLD','cid'])};
function setup(){
 const statements:string[]=[];
 const query=vi.fn(async(strings:TemplateStringsArray)=>{statements.push(strings.join('?'));return strings[0]?.includes('select t.created_block')?[{created_block:null,recovered:false,indexed:false}]:[];});
 const sql=Object.assign(query,{begin:async(fn:(tx:unknown)=>unknown)=>fn(query)}) as unknown as Sql;
 const rpc:MarketRpc={chainId:async()=>56,header:async tag=>{const n=typeof tag==='bigint'?tag:100n;return {number:n,hash,parentHash:hash,timestamp:1000+Number(n-10n)};},logs:async(from,to)=>from<=10n&&to>=10n?[log]:[],call:async()=>{throw Error('unexpected call');}};
 const fetcher=vi.fn(async()=>Response.json({id:1,result:{transfers:[{blockNum:'0xa'}]}}));
 return {sql,rpc,fetcher,statements};
}
it('recovers a verified creation and records coverage only after reading its full first minute',async()=>{
 vi.mocked(projectFlap).mockClear();const s=setup();
 expect(await recoverFlapLaunch(s.sql,s.rpc,'https://rpc.invalid',token,s.fetcher)).toBe(true);
 expect(projectFlap).toHaveBeenCalledTimes(2);
 expect(s.statements.some(q=>q.includes('insert into chain_v2.flap_launch_coverage'))).toBe(true);
});
it('does not trust a provider mint hint when the matching Portal creation is missing',async()=>{
 vi.mocked(projectFlap).mockClear();const s=setup();
 expect(await recoverFlapLaunch(s.sql,{...s.rpc,logs:async()=>[]},'https://rpc.invalid',token,s.fetcher)).toBe(false);
 expect(projectFlap).not.toHaveBeenCalled();
 expect(s.statements.some(q=>q.includes('insert into'))).toBe(false);
});
it('retains an unknown age when optional transfer history is unsupported',async()=>{
 const s=setup();expect(await recoverFlapLaunch(s.sql,s.rpc,'https://rpc.invalid',token,async()=>new Response('',{status:400}))).toBe(false);
 expect(s.statements.some(q=>q.includes('insert into'))).toBe(false);
});
it('does not certify a first minute that has not finalized yet',async()=>{
 const s=setup(),rpc={...s.rpc,header:async(tag:bigint|'finalized')=>({...await s.rpc.header(tag),number:tag==='finalized'?20n:tag})};
 expect(await recoverFlapLaunch(s.sql,rpc,'https://rpc.invalid',token,s.fetcher)).toBe(true);
 expect(s.statements.some(q=>q.includes('insert into chain_v2.flap_launch_coverage'))).toBe(false);
});
