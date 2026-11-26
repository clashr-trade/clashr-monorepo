import {readFileSync} from 'node:fs';
import postgres from 'postgres';
import {prepareFlapStartup, IndexStartupError} from '../src/bsc/startup';
import {BscRpc, BscRpcRequestError} from '../src/bsc/rpc';

const database = process.env.BSC_INDEX_DATABASE_URL;
if (!database || !process.env.BSC_RPC_URL) throw new Error('Index database and BSC RPC required.');
const sql = postgres(database, {max: 1, prepare: false, fetch_types: false, onnotice: () => {}});
try {
  const schema = readFileSync(new URL('../../../packages/db/migrations/0021_flap_startup_config.sql', import.meta.url), 'utf8');
  const settings = await prepareFlapStartup(sql, new BscRpc(process.env.BSC_RPC_URL), {...process.env, DATABASE_URL: database}, {schema});
  for (const mode of ['history', 'live'] as const) console.error(`[${mode}] persisted configuration: start=${settings[mode].startBlock}, epoch=${settings[mode].epoch}`);
  console.log(JSON.stringify({BSC_START_BLOCK: settings.history.startBlock, BSC_INDEX_EPOCH: settings.history.epoch,
    BSC_LIVE_START_BLOCK: settings.live.startBlock, BSC_LIVE_INDEX_EPOCH: settings.live.epoch}));
} catch (error) {
  console.error(error instanceof IndexStartupError || error instanceof BscRpcRequestError ? error.message : 'Index startup failed. Check configuration, database migrations/permissions and RPC access. No existing cursors were changed.');
  process.exitCode = 1;
} finally {
  await sql.end({timeout: 2});
}
