import { Hono } from 'hono';
import postgres, { type Sql } from 'postgres';
import { getNetwork, type SupportedChainId } from '@rushr/core/chain/networks';
import { dbUrl, type Env } from './env';

type Context = { Bindings: Env; Variables: { chainId: SupportedChainId; chainSql: Sql;
  coverage?: { fromBlock: string; throughBlock: string; finality: 'finalized' } } };
type OpenDatabase = (env: Env) => Sql;
const address = /^0x[0-9a-fA-F]{40}$/;

/** Independent read API. No legacy query/chain fallback and no implicit hydration. */
export function createChainApi(open: OpenDatabase = (env) => postgres(dbUrl(env), { max: 2, fetch_types: false, prepare: false })) {
  const api = new Hono<Context>();
  api.use('/chains/:chainId/*', async (c, next) => {
    const raw = c.req.param('chainId');
    if (!/^(4663|56|97)$/.test(raw)) return c.json({ error: 'unsupported_chain' }, 400);
    c.set('chainId', getNetwork(Number(raw)).id);
    return next();
  });
  api.get('/chains/:chainId/capabilities', (c) => c.json({
    chainId: c.var.chainId, network: getNetwork(c.var.chainId),
    marketReadsConfigured: c.env.CHAIN_V2_READS === '1', trading: false, websocket: false,
    launchpadCurves: false, infinity: false,
    ingestion: c.var.chainId === 56 ? { finality: 'finalized', scope: 'pancakeswap-v2-v3-wbnb', usdPricing: false, spotPricing: false, walletAttribution: false } : null,
  }, 200, { 'cache-control': 'no-store' }));
  api.use('/chains/:chainId/*', async (c, next) => {
    if (c.env.CHAIN_V2_READS !== '1') return c.json({ chainId: c.var.chainId, error: 'chain_storage_disabled' }, 503);
    const sql = open(c.env);
    c.set('chainSql', sql);
    try {
      // The future BSC indexer must explicitly attest its initial backfill is ready.
      // An empty database is not evidence that a chain has no tokens.
      const [state] = c.var.chainId === 4663
        ? await sql`select not exists(select 1 from chain_v2.legacy_tables t left join chain_v2.backfill_progress p using(table_name) where p.complete is distinct from true) as ready`
        : await sql`select block::text,start_block::text,observed_finalized::text,halt_reason,
            block is not null and block=observed_finalized and halt_reason is null
            and checked_at > now()-interval '120 seconds' as ready from chain_v2.market_cursors where chain_id=${c.var.chainId}`;
      if (!state?.ready) return c.json({ chainId: c.var.chainId, error: 'chain_data_not_ready' }, 503);
      if (c.var.chainId === 56) c.set('coverage', { fromBlock: state.start_block, throughBlock: state.block, finality: 'finalized' });
      return await next();
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
  api.get('/chains/:chainId/tokens', async (c) => {
    const rawLimit = c.req.query('limit') ?? '50';
    const status = c.req.query('status');
    if (!/^[1-9][0-9]{0,2}$/.test(rawLimit) || Number(rawLimit) > 100 || (status && !['new', 'bonding', 'migrated', 'spot'].includes(status))) return c.json({ error: 'invalid_query' }, 400);
    const rows = await c.var.chainSql`
      select * from chain_v2.tokens where chain_id=${c.var.chainId}
      and (${status ?? null}::text is null or status=${status ?? null})
      order by created_at desc,address limit ${Number(rawLimit)}`;
    return c.json({ chainId: c.var.chainId, coverage: c.var.coverage, tokens: rows }, 200, { 'cache-control': 'no-store' });
  });
  api.get('/chains/:chainId/tokens/:address', async (c) => {
    const token = c.req.param('address');
    if (!address.test(token)) return c.json({ error: 'invalid_address' }, 400);
    const [row] = await c.var.chainSql`select * from chain_v2.tokens where chain_id=${c.var.chainId} and address=${token.toLowerCase()}`;
    return row ? c.json({ chainId: c.var.chainId, coverage: c.var.coverage, token: row }, 200, { 'cache-control': 'no-store' }) : c.json({ chainId: c.var.chainId, error: 'not_found' }, 404);
  });
  api.get('/chains/:chainId/tokens/:address/pools', async (c) => {
    const token = c.req.param('address');
    if (!address.test(token)) return c.json({ error: 'invalid_address' }, 400);
    const rows = await c.var.chainSql`select * from chain_v2.pools where chain_id=${c.var.chainId} and token=${token.toLowerCase()} order by dex,id limit 100`;
    return c.json({ chainId: c.var.chainId, coverage: c.var.coverage, pools: rows }, 200, { 'cache-control': 'no-store' });
  });
  api.get('/chains/:chainId/tokens/:address/swaps', async (c) => {
    const token = c.req.param('address');
    if (!address.test(token)) return c.json({ error: 'invalid_address' }, 400);
    if (c.var.chainId !== 56) return c.json({ error: 'unsupported_capability' }, 400);
    const rows = await c.var.chainSql`select s.*,l.block,l.block_hash,b.time,b.finality
      from chain_v2.market_swaps s join chain_v2.market_logs l using(chain_id,tx,log_index)
      join chain_v2.market_blocks b on b.chain_id=l.chain_id and b.number=l.block
      where s.chain_id=56 and s.token=${token.toLowerCase()} order by l.block desc,s.log_index desc limit 100`;
    return c.json({ chainId: 56, coverage: c.var.coverage, scope: 'pool-execution', swaps: rows }, 200, { 'cache-control': 'no-store' });
  });
  return api;
}

export const chainApi = createChainApi();
