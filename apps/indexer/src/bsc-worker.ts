import postgres from 'postgres';
import { bscConfig, type BscEnv } from './bsc/config';
import { ingestBscBatch } from './bsc/ingest';
import { parseBscJob, type BscJob } from './bsc/jobs';
import { BscRpc } from './bsc/rpc';

export async function enqueueBscTick(env: BscEnv, scheduledTime: number) {
  if (env.BSC_INDEX_ENABLED !== '1') return;
  if (!env.BSC_INDEX_QUEUE) throw new Error('Dedicated BSC queue binding required');
  const config = await bscConfig(env);
  const job: BscJob = { version: 2, chainId: 56, kind: 'market-index', configHash: config.hash, minute: Math.floor(scheduledTime / 60_000), step: 0 };
  await env.BSC_INDEX_QUEUE.send(job);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      if (env.BSC_INDEX_ENABLED !== '1') return Response.json({ chainId: 56, enabled: false, trading: false });
      await bscConfig(env); // No implicit postgres() defaults when configuration is missing.
      const sql = postgres(env.DATABASE_URL!, { max: 1, fetch_types: false, prepare: false });
      try {
        const [cursor] = await sql`select * from chain_v2.market_cursors where chain_id=56`;
        return Response.json({ chainId: 56, enabled: true, trading: false, cursor: cursor ?? null }, { headers: { 'cache-control': 'no-store' } });
      } finally { await sql.end({ timeout: 5 }); }
    }
    if (request.method !== 'POST' || url.pathname !== '/admin/tick') return new Response('Not found', { status: 404 });
    if (!env.ADMIN_TOKEN || request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return new Response('Unauthorized', { status: 401 });
    if (env.BSC_INDEX_ENABLED !== '1') return Response.json({ error: 'bsc_index_disabled' }, { status: 503 });
    await enqueueBscTick(env, Date.now());
    return Response.json({ chainId: 56, queued: true });
  },
  async scheduled(event, env) { await enqueueBscTick(env, event.scheduledTime); },
  async queue(batch, env) {
    for (const message of batch.messages) {
      let job: BscJob;
      try { job = parseBscJob(message.body); }
      catch { console.error('Rejected invalid BSC queue identity', message.id); message.ack(); continue; }
      if (env.BSC_INDEX_ENABLED !== '1') { message.retry({ delaySeconds: 300 }); continue; }
      let sql: ReturnType<typeof postgres> | undefined;
      try {
        const config = await bscConfig(env);
        // Delayed jobs from a prior configuration do not reach SQL or RPC.
        if (job.configHash !== config.hash) { console.error('Rejected stale BSC job', message.id); message.ack(); continue; }
        sql = postgres(env.DATABASE_URL!, { max: 1, fetch_types: false, prepare: false });
        const result = await ingestBscBatch(sql, new BscRpc(env.BSC_RPC_URL!), config, job);
        console.log('bsc index', JSON.stringify(result));
        // Persisted continuation intent survives commit-success / queue-send-failure.
        // Re-delivery sends the same child identity, whose SQL job ledger deduplicates it.
        if ('continueIndexing' in result && result.continueIndexing && job.step < 19) {
          if (!env.BSC_INDEX_QUEUE) throw new Error('Dedicated BSC queue binding required');
          await env.BSC_INDEX_QUEUE.send({ ...job, step: job.step + 1 });
        }
        if (result.phase === 'busy') message.retry({ delaySeconds: 30 });
        else message.ack();
      } catch (error) {
        // Never log credentials, provider URLs or raw token metadata.
        console.error('BSC indexing batch failed', error instanceof Error ? error.message.slice(0, 200) : 'unknown error');
        message.retry({ delaySeconds: 60 });
      } finally { await sql?.end({ timeout: 5 }); }
    }
  },
} satisfies ExportedHandler<BscEnv, unknown>;
