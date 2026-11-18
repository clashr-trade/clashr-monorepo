import type { Sql } from 'postgres';

const TABLES = new Set(['tokens', 'pools', 'swaps', 'transfers', 'positions', 'balances', 'holder_backfill', 'wallets', 'wallet_pnl', 'candles', 'signals', 'deployer_stats', 'indexer_state', 'trades_ledger']);
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** One bounded, transactional batch. Only one worker may own legacy->v2 writes.
 * An unfinished backfill is always completed before draining changes. */
export async function migrateLegacyBatch(sql: Sql, limit = 200): Promise<{ phase: 'busy' | 'backfill' | 'changes' | 'idle'; processed: number; table?: string }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Batch size must be between 1 and 1000');
  return sql.begin(async (tx) => {
    const [lock] = await tx`select pg_try_advisory_xact_lock(4663,120012) as acquired`;
    if (!lock?.acquired) return { phase: 'busy' as const, processed: 0 };
    await tx`insert into chain_v2.backfill_progress(table_name) select table_name from chain_v2.legacy_tables on conflict do nothing`;
    const [job] = await tx<{ table_name: string; key_columns: string[]; last_key: unknown }[]>`
      select p.table_name,t.key_columns,p.last_key from chain_v2.backfill_progress p
      join chain_v2.legacy_tables t using(table_name) where not p.complete order by p.table_name limit 1`;
    if (job) {
      if (!TABLES.has(job.table_name) || !job.key_columns.every((key) => /^[a-z_]+$/.test(key))) throw new Error('Invalid migration manifest');
      const table = identifier(job.table_name);
      const columns = job.key_columns.map((key) => `s.${identifier(key)}`);
      const previous = job.key_columns.map((key) => `(jsonb_populate_record(null::public.${table},$1::text::jsonb)).${identifier(key)}`);
      const keyObject = job.key_columns.map((key) => `'${key}',s.${identifier(key)}`).join(',');
      const rows = await tx.unsafe<{ row_key: unknown }[]>(`
        select jsonb_build_object(${keyObject}) as row_key from public.${table} s
        where $1::text is null or row(${columns.join(',')}) > row(${previous.join(',')})
        order by ${columns.join(',')} limit $2`, [job.last_key == null ? null : JSON.stringify(job.last_key), limit]);
      if (rows.length) {
        await tx`select chain_v2.sync_legacy_row(${job.table_name},k) from jsonb_array_elements(${JSON.stringify(rows.map((row) => row.row_key))}::text::jsonb) k`;
        await tx`update chain_v2.backfill_progress set last_key=${JSON.stringify(rows.at(-1)!.row_key)}::text::jsonb,updated_at=now() where table_name=${job.table_name}`;
      } else {
        await tx`update chain_v2.backfill_progress set complete=true,updated_at=now() where table_name=${job.table_name}`;
      }
      return { phase: 'backfill' as const, processed: rows.length, table: job.table_name };
    }
    // No monotonic watermark: sequence allocation order is not commit order.
    const changes = await tx<{ id: string; table_name: string; row_key: unknown }[]>`
      select id,table_name,row_key from chain_v2.legacy_changes order by id limit ${limit} for update skip locked`;
    if (changes.length) {
      // One round trip per batch, without losing all-or-nothing acknowledgement.
      await tx`select chain_v2.sync_legacy_row(k->>'table_name',k->'row_key')
        from jsonb_array_elements(${JSON.stringify(changes.map(({ table_name, row_key }) => ({ table_name, row_key })))}::text::jsonb) k`;
      await tx`delete from chain_v2.legacy_changes where id in ${tx(changes.map((change) => change.id))}`;
    }
    return { phase: changes.length ? 'changes' as const : 'idle' as const, processed: changes.length };
  });
}

/** Full-row audit at one consistent snapshot. Pause legacy writers and drain first
 * for a cutover decision; a successful audit does not fence future writes. */
export async function reconcileLegacySnapshot(sql: Sql) {
  return sql.begin('isolation level repeatable read read only', async (tx) => {
    const [state] = await tx`
      select (select count(*)::int from chain_v2.legacy_changes) as pending,
        not exists(select 1 from chain_v2.legacy_tables t left join chain_v2.backfill_progress p using(table_name)
          where p.complete is distinct from true) as complete`;
    const tables = [];
    for (const name of TABLES) {
      const table = identifier(name);
      const projection = name === 'tokens'
        ? `(to_jsonb(s)-'price_eth') || jsonb_build_object('chain_id',4663,'price_native',s.price_eth)`
        : name === 'trades_ledger' ? 'to_jsonb(s)' : `to_jsonb(s) || jsonb_build_object('chain_id',4663)`;
      const [counts] = await tx.unsafe<{ source: string; target: string; missing: string; extra: string }[]>(`
        with source as (select ${projection} as row from public.${table} s),
          target as (select to_jsonb(t) as row from chain_v2.${table} t where chain_id=4663)
        select (select count(*) from source)::text as source,
          (select count(*) from target)::text as target,
          (select count(*) from (select row from source except select row from target) d)::text as missing,
          (select count(*) from (select row from target except select row from source) d)::text as extra`);
      tables.push({ table: name, ...counts! });
    }
    return { ready: state?.complete === true && state.pending === 0 && tables.every((t) => t.missing === '0' && t.extra === '0'),
      complete: state?.complete === true, pending: state?.pending, tables };
  });
}
