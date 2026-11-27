import type {Sql} from 'postgres';
import {bscConfig, bscConfigIdentity, type BscEnv} from './config';
import type {MarketRpc} from './rpc';

export class IndexStartupError extends Error {}
export type StartupEnv = BscEnv & {BSC_LIVE_START_BLOCK?: string; BSC_LIVE_INDEX_EPOCH?: string; BSC_LIVE_CATCHUP_BLOCKS?:string};
type Settings = {startBlock: string; epoch: string; hash: string};
type Cursor = {start_block: string; config_hash: string; halt_reason: string | null};

/** Resolves workers atomically. Optional audited handoff retains the full history cursor. */
export async function prepareFlapStartup(sql: Sql, rpc: Pick<MarketRpc, 'chainId' | 'header'>, env: StartupEnv,
  options: {readOnly?: boolean; schema?: string} = {}) {
  return sql.begin(async tx => {
    if (options.readOnly) await tx`set transaction read only`;
    else {
      const [locks] = await tx`select pg_try_advisory_xact_lock(56,130013) as history, pg_try_advisory_xact_lock(56,130014) as live`;
      if (!locks?.history || !locks?.live) throw new IndexStartupError('An index worker is active. Stop the other backend group before startup.');
      const [existing] = await tx`select to_regclass('chain_v2.flap_startup_configs') as name`;
      if (!existing?.name) {
        if (!options.schema) throw new IndexStartupError('Startup configuration schema is required.');
        await tx.unsafe(options.schema);
      }
    }
    const [table] = await tx`select to_regclass('chain_v2.flap_startup_configs') as name`;
    const result = {} as Record<'history' | 'live', Settings>;
    let finalized: string | undefined;
    for (const mode of ['history', 'live'] as const) {
      const live = mode === 'live';
      const cursorTable = tx(live ? 'chain_v2.flap_live_cursors' : 'chain_v2.market_cursors');
      const [cursor] = await tx<Cursor[]>`select start_block::text, config_hash, halt_reason from ${cursorTable} where chain_id=56`;
      const [saved] = table?.name ? await tx<{config_hash: string; configuration: {startBlock?: string; epoch?: string}}[]>`
        select config_hash, configuration from chain_v2.flap_startup_configs where chain_id=56 and mode=${mode}` : [];
      if (cursor?.halt_reason) throw new IndexStartupError(`[${mode}] Saved integrity halt; finalized history must be reconciled before restart.`);
      const calculate = async (startBlock: string, epoch: string): Promise<Settings> => {
        const config = await bscConfig({...env, BSC_INDEX_ENABLED: '1', BSC_INDEX_SOURCE: 'flap', BSC_START_BLOCK: startBlock, BSC_INDEX_EPOCH: epoch});
        return {startBlock, epoch, hash: config.hash};
      };
      let settings: Settings;
      if (saved) {
        if (typeof saved.configuration.startBlock !== 'string' || typeof saved.configuration.epoch !== 'string') {
          throw new IndexStartupError(`[${mode}] Invalid saved startup configuration; reviewed recovery required.`);
        }
        settings = await calculate(saved.configuration.startBlock, saved.configuration.epoch);
        if (settings.hash !== saved.config_hash || !cursor || cursor.config_hash !== saved.config_hash) {
          throw new IndexStartupError(`[${mode}] Saved configuration is incompatible with this decoder or cursor. Reviewed migration/replay required.`);
        }
      } else {
        let start = (live ? env.BSC_LIVE_START_BLOCK : env.BSC_START_BLOCK) || undefined;
        const epoch = live ? env.BSC_LIVE_INDEX_EPOCH || `${env.BSC_INDEX_EPOCH || 'flap_v1'}_live` : env.BSC_INDEX_EPOCH || 'flap_v1';
        if (cursor) {
          // A legacy live window may have advanced start_block, so try supplied identity first.
          settings = await calculate(start ?? cursor.start_block, epoch);
          if (settings.hash !== cursor.config_hash && start !== cursor.start_block) settings = await calculate(cursor.start_block, epoch);
          if (settings.hash !== cursor.config_hash) {
            throw new IndexStartupError(`[${mode}] Legacy cursor configuration mismatch (saved start=${cursor.start_block}, hash=${cursor.config_hash}). Restore its original epoch/start configuration to adopt it; no data was changed.`);
          }
        } else {
          if (!start) {
            if (!finalized) {
              if (await rpc.chainId() !== 56) throw new IndexStartupError('RPC chain is not BNB mainnet (56).');
              const head = await rpc.header('finalized');
              const age = Date.now() / 1000 - head.timestamp;
              if (head.number < 1n || age > 120 || age < -30) throw new IndexStartupError('RPC finalized head is stale, future dated or invalid.');
              finalized = head.number.toString();
            }
            start = finalized;
          }
          settings = await calculate(start, epoch);
          if (!options.readOnly) await tx`insert into ${cursorTable}(chain_id,config_hash,start_block) values(56,${settings.hash},${settings.startBlock})`;
        }
        if (!options.readOnly) {
          const identity = bscConfigIdentity({...env, BSC_INDEX_SOURCE: 'flap', BSC_START_BLOCK: settings.startBlock, BSC_INDEX_EPOCH: settings.epoch});
          await tx`insert into chain_v2.flap_startup_configs(chain_id,mode,config_hash,configuration)
            values(56,${mode},${settings.hash},${tx.json(identity)})`;
        }
      }
      result[mode] = settings;
    }
    if(!options.readOnly&&env.BSC_LIVE_CATCHUP_BLOCKS){
      if(!/^[1-9][0-9]{2,7}$/.test(env.BSC_LIVE_CATCHUP_BLOCKS))throw new IndexStartupError('Invalid BSC_LIVE_CATCHUP_BLOCKS; minimum 100 blocks.');
      if(await rpc.chainId()!==56)throw new IndexStartupError('RPC chain is not BNB mainnet (56).');
      const head=await rpc.header('finalized');
      if(Date.now()/1000-head.timestamp>120||head.timestamp>Date.now()/1000+30)throw new IndexStartupError('Invalid finalized head for live handoff.');
      const [previous]=await tx`select * from chain_v2.flap_live_cursors where chain_id=56 for update`;
      const [history]=await tx`select * from chain_v2.market_cursors where chain_id=56 for update`;
      if(previous?.block!=null&&head.number-BigInt(previous.block)>BigInt(env.BSC_LIVE_CATCHUP_BLOCKS)){
        if(!history||BigInt(history.start_block)>BigInt(previous.start_block)||history.block==null||BigInt(history.block)>head.number)throw new IndexStartupError('Live handoff requires a retained history cursor covering the old live start.');
        if((await rpc.header(BigInt(previous.block))).hash!==previous.block_hash||(await rpc.header(BigInt(history.block))).hash!==history.block_hash)throw new IndexStartupError('Live handoff checkpoint ancestry mismatch.');
        if((await rpc.header(head.number)).hash!==head.hash)throw new IndexStartupError('Live handoff finalized ancestry changed.');
        const startBlock=String(head.number),epoch=result.live.epoch;
        const identity=bscConfigIdentity({...env,BSC_INDEX_SOURCE:'flap',BSC_START_BLOCK:startBlock,BSC_INDEX_EPOCH:epoch});
        const config=await bscConfig({...env,BSC_INDEX_ENABLED:'1',BSC_INDEX_SOURCE:'flap',BSC_START_BLOCK:startBlock,BSC_INDEX_EPOCH:epoch});
        await tx`insert into chain_v2.flap_live_handoffs(previous_start,previous_block,previous_hash,next_start,configuration) values(${previous.start_block},${previous.block},${previous.block_hash},${startBlock},${tx.json(result.live)})`;
        await tx`update chain_v2.flap_live_cursors set start_block=${startBlock},block=null,block_hash=null,config_hash=${config.hash},observed_finalized=${startBlock},checked_at=now() where chain_id=56`;
        await tx`update chain_v2.flap_startup_configs set config_hash=${config.hash},configuration=${tx.json(identity)} where chain_id=56 and mode='live'`;
        result.live={startBlock,epoch,hash:config.hash};
      }
    }
    return result;
  });
}
