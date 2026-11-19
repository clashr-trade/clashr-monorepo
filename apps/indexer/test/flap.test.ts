import {describe,it,expect,vi} from 'vitest';
import {encodeAbiParameters,encodeEventTopics} from 'viem';
import {decodeFlap,FLAP_EVENTS,FLAP_PORTAL} from '../src/bsc/flap';
import type {MarketLog} from '../src/bsc/rpc';
import {bscConfig} from '../src/bsc/config';
const token='0x1111111111111111111111111111111111111111',creator='0x2222222222222222222222222222222222222222';
const hash=`0x${'11'.repeat(32)}` as const;
function launch():MarketLog{return {address:FLAP_PORTAL,blockNumber:'0xa',blockHash:hash,transactionHash:hash,logIndex:'0x0',
 topics:encodeEventTopics({abi:FLAP_EVENTS,eventName:'TokenCreated'}),
 data:encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'address'},{type:'string'},{type:'string'},{type:'string'}],[10n,creator,1n,token,'Token','TOK','bafytest'])};}
describe('Flap finalized adapter',()=>{
 it('decodes the canonical unindexed launch and preserves its CID/creator',()=>{expect(decodeFlap(launch())).toMatchObject({event:'TokenCreated',token,args:{creator,meta:'bafytest'}});});
 it('rejects a spoofed emitter, indexed shape, or malformed data',()=>{
  expect(()=>decodeFlap({...launch(),address:token})).toThrow('emitter');
  expect(()=>decodeFlap({...launch(),topics:[...launch().topics,hash]})).toThrow('shape');
  expect(()=>decodeFlap({...launch(),data:'0x'})).toThrow();
 });
 it('changes config identity when switching from Pancake to Flap',async()=>{
  const env={BSC_INDEX_ENABLED:'1',BSC_RPC_URL:'https://rpc.example',DATABASE_URL:'postgres://local',BSC_START_BLOCK:'10',BSC_INDEX_EPOCH:'test'};
  const a=await bscConfig(env),b=await bscConfig({...env,BSC_INDEX_SOURCE:'flap'});
  expect(a.hash).not.toBe(b.hash);expect(b.source).toBe('flap');
  await expect(bscConfig({...env,BSC_INDEX_SOURCE:'unknown'})).rejects.toThrow('Unsupported');
 });
});
