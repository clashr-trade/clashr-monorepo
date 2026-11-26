import type {Sql} from 'postgres';
import {bscConfig, bscConfigIdentity, type BscEnv} from './config';
import type {MarketRpc} from './rpc';

export class IndexStartupError extends Error {}
export type StartupEnv = BscEnv & {BSC_LIVE_START_BLOCK?: string; BSC_LIVE_INDEX_EPOCH?: string};
type Settings = {startBlock: string; epoch: string; hash: string};
type Cursor = {start_block: string; config_hash: string; halt_reason: string | null};

/** Resolves both workers atomically. Never changes an existing cursor or its hash. */
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
    return result;
  });
}
