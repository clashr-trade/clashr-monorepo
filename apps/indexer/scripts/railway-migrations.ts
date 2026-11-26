import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postgres, {type Sql} from 'postgres';
import {validateIndexDatabase} from '../../../scripts/backend-env.mjs';

export class DeploymentMigrationError extends Error {}
type Migration = {name: string; sql: string; hash: string};
async function manifest(product: boolean): Promise<Migration[]> {
  const root = new URL('../../../packages/db/', import.meta.url);
  const journal = JSON.parse(await readFile(new URL('migrations/meta/_journal.json', root), 'utf8')) as {entries: {tag: string}[]};
  const names = journal.entries.map(entry => `migrations/${entry.tag}.sql`);
  if (product) names.push('product/0001_bnb_product.sql', 'product/0002_receipt_recovery.sql');
  return Promise.all(names.map(async name => {
    const sql = (await readFile(new URL(name, root), 'utf8')).replace(/\r\n/g, '\n');
    return {name, sql, hash: createHash('sha256').update(sql).digest('hex')};
  }));
}

/** Fresh databases and databases owned by this runner only. Never guesses an existing baseline. */
export async function migrateDeployment(sql: Sql, product: boolean) {
  const migrations = await manifest(product);
  return sql.begin(async tx => {
    await tx`set local lock_timeout='30s'`;
    await tx`select pg_advisory_xact_lock(56,130022)`;
    const [tracked] = await tx`select to_regclass('public.clashr_deployment_migrations') as name`;
    if (!tracked?.name) {
      const existing = await tx`select tablename from pg_tables where schemaname in ('public','chain_v2') limit 1`;
      if (existing.length) throw new DeploymentMigrationError('Refusing to initialize an untracked non-empty database. Use the fresh Railway PostgreSQL database; existing databases need a reviewed migration baseline.');
      await tx`create table public.clashr_deployment_migrations(name text primary key, hash text not null, applied_at timestamptz not null default now())`;
    }
    let applied = 0;
    for (const migration of migrations) {
      const [saved] = await tx`select hash from public.clashr_deployment_migrations where name=${migration.name}`;
      if (saved) {
        if (saved.hash !== migration.hash) throw new DeploymentMigrationError(`Migration checksum changed: ${migration.name}. Restore the applied migration; do not rewrite its history.`);
        continue;
      }
      for (const statement of migration.sql.split('--> statement-breakpoint')) if (statement.trim()) await tx.unsafe(statement);
      await tx`insert into public.clashr_deployment_migrations(name,hash) values(${migration.name},${migration.hash})`;
      applied++;
    }
    if (product) {
      const [identity] = await tx`select chain_id from product_config where singleton=true`;
      if (identity?.chain_id !== 56) throw new DeploymentMigrationError('Product database must identify BNB chain 56.');
    }
    return applied;
  });
}

async function main() {
  const productUrl = process.env.DATABASE_URL, indexUrl = process.env.BSC_INDEX_DATABASE_URL ?? productUrl;
  if (!productUrl || !indexUrl) throw new DeploymentMigrationError('DATABASE_URL is required.');
  validateIndexDatabase(indexUrl, process.env);
  // The recommended Railway setup uses the same dedicated BNB database for both roles.
  for (const [label, url, product] of [['product', productUrl, true], ...(indexUrl === productUrl ? [] : [['index', indexUrl, false]])] as [string,string,boolean][]) {
    const sql = postgres(url, {max: 1, prepare: false, fetch_types: false, onnotice: () => {}});
    try {console.log(`${label} database: applied ${await migrateDeployment(sql, product)} migrations`);}
    finally {await sql.end({timeout: 5});}
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(error instanceof DeploymentMigrationError ? error.message : 'Database migration failed. Check database access and deployment logs; credentials were not printed.'); process.exitCode = 1;});
}
