/** Read-only comparison of worker configuration with saved cursors. */
import postgres from 'postgres';
import {bscConfig} from '../src/bsc/config';
import {BscRpc, BscRpcRequestError} from '../src/bsc/rpc';

const database = process.env.BSC_INDEX_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database) throw new Error('Configure BSC_INDEX_DATABASE_URL first.');
const sql = postgres(database, {max: 1, prepare: false, fetch_types: false});
let failed = false;
try {
  for (const live of [false, true]) {
    const name = live ? 'live' : 'history';
    const env = {...process.env, DATABASE_URL: database, BSC_INDEX_ENABLED: '1', BSC_INDEX_SOURCE: 'flap',
      BSC_START_BLOCK: live ? process.env.BSC_LIVE_START_BLOCK : process.env.BSC_START_BLOCK,
      BSC_INDEX_EPOCH: (process.env.BSC_INDEX_EPOCH ?? '') + (live ? '_live' : '')};
    const config = await bscConfig(env);
    const rows = await sql.begin(async tx => {
      await tx`set transaction read only`;
      return tx<{start_block: string; config_hash: string; block: string | null; block_hash: string | null; halt_reason: string | null}[]>`
        select start_block::text, config_hash, block::text, block_hash, halt_reason
        from ${tx(live ? 'chain_v2.flap_live_cursors' : 'chain_v2.market_cursors')} where chain_id=56`;
    });
    const cursor = rows[0];
    console.log(`[${name}] configured start=${config.startBlock}, hash=${config.hash}`);
    if (!cursor) {
      console.log(`[${name}] No saved cursor. First startup will initialize it.`);
      continue;
    }
    console.log(`[${name}] saved start=${cursor.start_block}, block=${cursor.block ?? 'not started'}, hash=${cursor.config_hash}`);
    if (cursor.config_hash !== config.hash) {
      failed = true;
      console.error(`[${name}] CONFIGURATION MISMATCH: restore the original start block and epoch for this database. Decoder/chain configuration changes can also change the hash.`);
    }
    if (cursor.halt_reason) {
      failed = true;
      console.error(`[${name}] Saved integrity halt exists; verify finalized block history before reconciliation.`);
    }
    if (cursor.block && cursor.block_hash) {
      try {
      const rpc = new BscRpc(env.BSC_RPC_URL!);
      if (await rpc.chainId() !== 56) {
        failed = true;
        console.error(`[${name}] RPC chain is not BNB mainnet (56).`);
      } else if ((await rpc.header(BigInt(cursor.block))).hash !== cursor.block_hash) {
        failed = true;
        console.error(`[${name}] STORED BLOCK HASH MISMATCH: provider history differs from the saved finalized block.`);
      } else console.log(`[${name}] Saved block hash matches the current RPC.`);
      } catch (error) {
        failed = true;
        console.error(`[${name}] ${error instanceof BscRpcRequestError ? error.message : 'RPC transport or response unavailable; saved block hash could not be verified.'}`);
      }
    }
  }
} catch (error) {
  failed = true;
  const code = (error as {code?: unknown})?.code;
  console.error(`Index check could not complete${typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? ` (${code})` : ''}. Check database access, migrations and RPC connectivity. Credentials were not printed.`);
} finally {
  await sql.end({timeout: 2});
}
console.log('Read-only check finished. No cursors or indexed data were modified.');
if (failed) process.exitCode = 1;
