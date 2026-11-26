import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { backendEnvironment, validateIndexDatabase } from './backend-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const workers = [
  ['api', 'product-dev.ts', []],
  ['live', 'flap-local.ts', ['--follow', '--live']],
  ['history', 'flap-local.ts', ['--follow']],
  ['metadata', 'flap-metadata.ts', ['--follow']],
  ['holders', 'flap-holders.ts', ['--follow']],
  ['safety', 'flap-safety.ts', ['--follow']],
  ['discovery', 'flap-enrich-active.ts', ['--follow']],
];

/** Direct Node children avoid shell quoting and allow the entire group to stop together. */
export function runServices(services, { cwd = root, env = process.env } = {}) {
  return new Promise((resolve) => {
    const children = new Set();
    let stopping = false;
    let result = 0;
    let deadline;

    function stop(code) {
      if (stopping) return;
      stopping = true;
      result = code;
      for (const child of children) child.kill('SIGTERM');
      deadline = setTimeout(() => {
        for (const child of children) child.kill('SIGKILL');
      }, 5000);
      deadline.unref();
    }
    const interrupted = () => stop(130);
    const terminated = () => stop(143);
    process.once('SIGINT', interrupted);
    process.once('SIGTERM', terminated);

    function finished() {
      if (children.size) return;
      clearTimeout(deadline);
      process.removeListener('SIGINT', interrupted);
      process.removeListener('SIGTERM', terminated);
      resolve(result);
    }

    for (const { name, args } of services) {
      const child = spawn(process.execPath, args, {
        cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
      children.add(child);
      for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
        createInterface({ input: stream }).on('line', (line) => output.write(`[${name}] ${line}\n`));
      }
      child.on('error', () => {
        console.error(`[${name}] Could not start Node process.`);
        stop(1);
      });
      child.on('exit', (code, signal) => {
        if (!stopping) {
          console.error(`[${name}] Exited (${signal ?? code}); stopping the backend group.`);
          stop(code || 1);
        }
      });
      child.on('close', () => {
        children.delete(child);
        finished();
      });
    }
    if (!services.length) finished();
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: pnpm run dev:backend [--railway|--env-file=PATH] [--check|--check-rpc|--check-index]');
    console.log('Starts the API and six Flap workers. Ctrl+C stops the group. PostgreSQL must already be running.');
    return;
  }
  if (args.some((arg) => !['--railway', '--check', '--check-rpc', '--check-index'].includes(arg) && !arg.startsWith('--env-file='))
      || args.filter((arg) => arg.startsWith('--env-file=')).length > 1) {
    throw new Error('Unknown or duplicate option. Run with --help.');
  }
  const envArgument = args.find((arg) => arg.startsWith('--env-file='));
  const managed = args.includes('--railway');
  const {env, source: envPath} = backendEnvironment(root, envArgument?.slice('--env-file='.length), managed);
  env.BSC_INDEX_DATABASE_URL ||= env.DATABASE_URL;
  if (managed) {
    env.PRODUCT_API_HOST ||= '::';
    env.PORT ||= '8790';
    for (const key of ['PRODUCT_ORIGIN', 'IP_SALT', 'ADMIN_TOKEN', 'PRODUCT_MEDIA_DIR']) {
      if (!env[key]) throw new Error(`Missing ${key} for the Railway backend.`);
    }
    if (new URL(env.PRODUCT_ORIGIN).protocol !== 'https:') throw new Error('Railway PRODUCT_ORIGIN must be the HTTPS frontend origin.');
  }
  for (const key of ['DATABASE_URL', 'BSC_INDEX_DATABASE_URL', 'BSC_RPC_URL']) {
    if (!env[key]) throw new Error(`Missing ${key}. Configure it before starting the backend.`);
  }
  for (const key of ['DATABASE_URL', 'BSC_INDEX_DATABASE_URL']) {
    let url;
    try { url = new URL(env[key]); } catch { throw new Error(`Invalid ${key}.`); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error(`Invalid ${key} protocol.`);
    if (key === 'BSC_INDEX_DATABASE_URL') validateIndexDatabase(env[key], env);
  }
  for (const key of ['BSC_START_BLOCK', 'BSC_LIVE_START_BLOCK']) {
    if (env[key] && !/^[1-9][0-9]{0,17}$/.test(env[key])) throw new Error(`Invalid ${key}.`);
  }
  if (env.BSC_INDEX_EPOCH && !/^[a-zA-Z0-9_-]{1,59}$/.test(env.BSC_INDEX_EPOCH)) {
    throw new Error('BSC_INDEX_EPOCH must contain 1..59 letters, digits, underscores or hyphens (live adds a suffix).');
  }
  const require = createRequire(new URL('../packages/trade/package.json', import.meta.url));
  let loader;
  try { loader = pathToFileURL(require.resolve('tsx')).href; }
  catch { throw new Error('tsx is not installed. Run pnpm install --frozen-lockfile first.'); }
  if (args.includes('--check-index')) {
    console.log(`Configuration file: ${envPath}`);
    for (const key of ['BSC_START_BLOCK', 'BSC_LIVE_START_BLOCK', 'BSC_INDEX_EPOCH']) {
      console.log(`${key}=${env[key]} (${process.env[key] ? 'process environment overrides file' : 'file'})`);
    }
    const result = spawnSync(process.execPath, ['--import', loader, path.join(root, 'apps/indexer/scripts/check-backend-index.ts')], {
      cwd: root, env, stdio: 'inherit', windowsHide: true,
    });
    process.exitCode = result.status ?? 1;
    return;
  }
  if (args.includes('--check-rpc')) {
    console.log(`BSC_RPC_URL source: ${process.env.BSC_RPC_URL ? 'process environment (overrides file)' : envPath}`);
    const result = spawnSync(process.execPath, ['--import', loader, path.join(root,'apps/indexer/scripts/check-backend-rpc.ts')], {
      cwd:root,env,stdio:'inherit',windowsHide:true,
    });
    process.exitCode=result.status??1;
    return;
  }
  const services = workers.map(([name, file, extra]) => ({
    name, args: ['--import', loader, path.join(root, 'apps/indexer/scripts', file), ...extra],
  }));
  console.log(`Backend group: ${services.map(({ name }) => name).join(', ')}`);
  if (args.includes('--check')) {
    console.log('Configuration and runner dependencies found; database/RPC connectivity was not tested.');
    return;
  }
  console.log('PostgreSQL must already be running. Ctrl+C stops all seven processes.');
  const startup = spawnSync(process.execPath, ['--import', loader, path.join(root, 'apps/indexer/scripts/prepare-backend-index.ts')], {
    cwd: root, env, encoding: 'utf8', windowsHide: true,
  });
  if (startup.stderr) process.stderr.write(startup.stderr);
  if (startup.status !== 0) {
    process.exitCode = startup.status ?? 1;
    console.error('Index preflight failed; no backend services were started.');
    return;
  }
  const resolved = JSON.parse(startup.stdout);
  for (const key of ['BSC_START_BLOCK', 'BSC_LIVE_START_BLOCK', 'BSC_INDEX_EPOCH']) {
    if (env[key] && env[key] !== resolved[key]) console.log(`${key}: using persisted database configuration instead of the environment value.`);
  }
  Object.assign(env, resolved);
  process.exitCode = await runServices(services, { env });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
