import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../apps/web/', import.meta.url));
const command = process.argv[2];
if (!['build', 'start'].includes(command)) {
  console.error('Usage: node scripts/web-node.mjs <build|start> [Next.js options]');
  process.exit(1);
}
const env = { ...process.env, CLASHR_WEB_RUNTIME: 'node' };
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: web, env, stdio: 'inherit', windowsHide: true });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    child.once('error', reject);
    child.once('close', (code) => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
      resolve(code ?? 1);
    });
  });
}
try {
  if (command === 'build') {
    const prepared = await run(['scripts/gen-whitepaper.mjs']);
    if (prepared !== 0) process.exit(prepared);
  }
  process.exitCode = await run(['node_modules/next/dist/bin/next', command, ...process.argv.slice(3)]);
} catch {
  console.error('Could not start Next.js. Run pnpm install --frozen-lockfile first.');
  process.exitCode = 1;
}
