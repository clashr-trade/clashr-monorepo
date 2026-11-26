import {existsSync, readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import path from 'node:path';

/** Railway injects variables; local development retains its existing env-file priority. */
export function backendEnvironment(root, envFile, managed = false) {
  const file = envFile ? path.resolve(root, envFile) : managed ? undefined
    : ['.env.backend', 'apps/web/.env.local'].map(name => path.join(root, name)).find(existsSync);
  if (envFile && !existsSync(file)) throw new Error('Environment file not found.');
  return {env: {...(file ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env,
    ...(managed ? {CLASHR_DEPLOYMENT: 'railway'} : {})}, source: file ?? 'process environment'};
}

/** Never silently allow arbitrary remote index databases or print connection secrets. */
export function validateIndexDatabase(value, env = process.env) {
  let url;
  try {url = new URL(value);} catch {throw new Error('Invalid BSC_INDEX_DATABASE_URL.');}
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid index database protocol.');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const privateRailway = env.CLASHR_DEPLOYMENT === 'railway'
    && /^[a-z0-9-]+\.railway\.internal$/i.test(url.hostname);
  if (!local && !privateRailway) throw new Error('Index database must be local or an explicitly configured Railway private PostgreSQL host.');
  return value;
}
