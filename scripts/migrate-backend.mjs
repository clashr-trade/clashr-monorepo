import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {backendEnvironment} from './backend-env.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../packages/trade/package.json', import.meta.url));
const managed = process.argv.includes('--railway');
const {env} = backendEnvironment(root, undefined, managed);
env.BSC_INDEX_DATABASE_URL ||= env.DATABASE_URL;
const result = spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href,
  fileURLToPath(new URL('../apps/indexer/scripts/railway-migrations.ts', import.meta.url))], {cwd: root, env, stdio: 'inherit', windowsHide: true});
process.exitCode = result.status ?? 1;
