import postgres from 'postgres';
// Node >=22.23.4 strips the TypeScript in this workspace-local module.
import { migrateLegacyBatch, reconcileLegacySnapshot } from '../src/chain-migration.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; no production/default fallback');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  if (process.argv.includes('--verify')) {
    const result = await reconcileLegacySnapshot(sql);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  } else {
    process.exitCode = 2; // Bounded run exhausted; resume rather than imply completion.
    for (let step = 0; step < 100; step++) {
      const result = await migrateLegacyBatch(sql);
      console.log(JSON.stringify(result));
      if (result.phase === 'idle') { process.exitCode = 0; break; }
      if (result.phase === 'busy') { process.exitCode = 3; break; }
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
