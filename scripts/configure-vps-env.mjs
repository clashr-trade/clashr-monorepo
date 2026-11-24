import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
const defaultOrigin = 'http://135.181.237.187:3000';

/** Change only public origin settings; preserve database, RPC and wallet secrets. */
export function configureEnv(source, value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid VPS origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Use an HTTP(S) origin without credentials, path, query or fragment.');
  }
  const settings = {
    DEV_ALLOWED_ORIGIN: url.origin,
    NEXT_PUBLIC_APP_URL: url.origin,
    NEXT_PUBLIC_SITE_URL: url.origin,
    PRODUCT_ORIGIN: url.origin,
    NEXT_PUBLIC_PRODUCT_CHAIN_ID: '56',
    CLASHR_HTTP_PREVIEW_ORIGIN: url.protocol === 'http:' && isIP(url.hostname) === 4 ? url.origin : '',
  };
  // The API must not call itself via a public HTTPS redirect or a firewall.
  if (!/^[ \t]*(?:export[ \t]+)?PRODUCT_MARKET_ORIGIN[ \t]*=/m.test(source)) {
    settings.PRODUCT_MARKET_ORIGIN = 'http://127.0.0.1:3000';
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  for (const [key, value] of Object.entries(settings)) {
    const assignment = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[^\\r\\n]*`, 'gm');
    if (assignment.test(source)) source = source.replace(assignment, () => `${key}=${value}`);
    else source += (source && !source.endsWith('\n') ? newline : '') + `${key}=${value}${newline}`;
  }
  return source;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !arg.startsWith('--origin='))) {
    throw new Error('Usage: pnpm run env:vps [--origin=https://your-domain.example]');
  }
  const origin = args[0]?.slice('--origin='.length) ?? defaultOrigin;
  const files = ['apps/web/.env.local', '.env.vps'].filter((file) => existsSync(path.join(root, file)));
  if (!files.includes('apps/web/.env.local')) {
    throw new Error('Configure apps/web/.env.local first. This command does not create credentials or databases.');
  }
  const updates = files.map((file) => ({ file, contents: configureEnv(readFileSync(path.join(root, file), 'utf8'), origin) }));
  for (const { file, contents } of updates) {
    const destination = path.join(root, file);
    const temporary = `${destination}.${process.pid}.tmp`;
    writeFileSync(temporary, contents, { mode: 0o600 });
    renameSync(temporary, destination);
    console.log(`Updated ${file}; private settings retained.`);
  }
  console.log(`Restart the frontend and backend. Open ${new URL(origin).origin}.`);
  console.log('For an optimized IP preview: npm run build:web, then npm run start:vps. HTTP is unencrypted; wallet providers may still require HTTPS.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
