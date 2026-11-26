/** Uses the same configuration resolver as startup, in a read-only transaction. */
import postgres from 'postgres';
import {prepareFlapStartup, IndexStartupError} from '../src/bsc/startup';
import {BscRpc, BscRpcRequestError} from '../src/bsc/rpc';

const database = process.env.BSC_INDEX_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database || !process.env.BSC_RPC_URL) throw new Error('Configure the index database and BSC_RPC_URL first.');
const sql = postgres(database, {max: 1, prepare: false, fetch_types: false});
let failed = false;
try {
  const settings = await prepareFlapStartup(sql, new BscRpc(process.env.BSC_RPC_URL), {...process.env, DATABASE_URL: database}, {readOnly: true});
  for (const mode of ['history', 'live'] as const) {
    console.log(`[${mode}] resolved start=${settings[mode].startBlock}, epoch=${settings[mode].epoch}, hash=${settings[mode].hash}`);
    const rows = await sql.begin(async tx => {
      await tx`set transaction read only`;
      return tx<{block: string | null; block_hash: string | null}[]>`
        select block::text, block_hash from ${tx(mode === 'live' ? 'chain_v2.flap_live_cursors' : 'chain_v2.market_cursors')} where chain_id=56`;
    });
    const cursor = rows[0];
    if (!cursor) console.log(`[${mode}] No cursor; settings above will be persisted on first startup.`);
    else if (cursor.block && cursor.block_hash) {
      try {
        const rpc = new BscRpc(process.env.BSC_RPC_URL);
        if (await rpc.chainId() !== 56) throw new IndexStartupError('RPC chain is not BNB mainnet (56).');
        if ((await rpc.header(BigInt(cursor.block))).hash !== cursor.block_hash) throw new IndexStartupError('STORED BLOCK HASH MISMATCH; provider history differs from the saved finalized block.');
        console.log(`[${mode}] Saved block ${cursor.block} hash matches the current RPC.`);
      } catch (error) {
        failed = true;
        console.error(`[${mode}] ${error instanceof IndexStartupError || error instanceof BscRpcRequestError ? error.message : 'RPC transport or response unavailable; saved block hash could not be verified.'}`);
      }
    }
  }
} catch (error) {
  failed = true;
  console.error(error instanceof IndexStartupError || error instanceof BscRpcRequestError ? error.message : 'Index check could not complete. Check configuration, database migrations and RPC access.');
} finally {
  await sql.end({timeout: 2});
}
console.log('Read-only check finished. No cursors or indexed data were modified.');
if (failed) process.exitCode = 1;
