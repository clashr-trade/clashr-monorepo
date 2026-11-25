import type {Sql} from 'postgres';
import type {BscConfig} from './config';
import type {MarketRpc} from './rpc';

/** Keep the UI live after downtime. The independent, continuous history cursor owns backfill.
 * Never delete events or claim coverage across the gap: start_block moves with this window.
 */
export async function resumeFlapLiveWindow(sql:Sql,rpc:MarketRpc,config:BscConfig,historyHash:string){
 if(!config.live||config.source!=='flap')return null;
 return sql.begin(async tx=>{
  const [lock]=await tx`select pg_try_advisory_xact_lock(56,130014) as acquired`;
  if(!lock?.acquired)return null;
  const [history]=await tx`select config_hash,start_block,halt_reason from chain_v2.market_cursors where chain_id=56`;
  if(!history||history.config_hash!==historyHash||history.halt_reason||BigInt(history.start_block)>config.startBlock)return null;
  await tx`insert into chain_v2.flap_live_cursors(chain_id,config_hash,start_block) values(56,${config.hash},${config.startBlock.toString()}) on conflict do nothing`;
  const [cursor]=await tx`select * from chain_v2.flap_live_cursors where chain_id=56 for update`;
  if(!cursor||cursor.config_hash!==config.hash||cursor.halt_reason)return null;
  if(await rpc.chainId()!==56)throw new Error('BSC provider chain mismatch');
  const head=await rpc.header('finalized');
  if(Math.abs(Date.now()/1000-head.timestamp)>120)throw new Error('BSC finalized head is stale or future dated');
  const previous=cursor.block===null?config.startBlock-1n:BigInt(cursor.block);
  if(head.number-previous<=2000n)return null;
  if(cursor.block_hash&&(await rpc.header(previous)).hash!==cursor.block_hash)throw new Error('Live checkpoint ancestry changed; operator reconciliation required');
  const start=head.number-120n,anchor=await rpc.header(start-1n);
  if((await rpc.header(head.number)).hash!==head.hash)throw new Error('Live window ancestry changed');
  await tx`update chain_v2.flap_live_cursors set start_block=${start.toString()},block=${anchor.number.toString()},block_hash=${anchor.hash},observed_finalized=${head.number.toString()},checked_at=now() where chain_id=56`;
  return {start:start.toString(),backfillFrom:previous.toString(),lagBlocks:(head.number-previous).toString()};
 });
}
