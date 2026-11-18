export interface BscToken {
  chain_id: 56; address: string; name: string; symbol: string; decimals: number;
  total_supply: string; created_at: string; supply_block: string | null;
}
export interface BscCoverage { fromBlock: string; throughBlock: string; finality: 'finalized' }
export interface BscPool { id: string; dex: string; quote: string; fee: number | null }
export interface BscSwap {
  tx: string; log_index: number; side: 'buy' | 'sell'; quote_amount: string;
  token_amount: string; native_execution_price: string | null; time: string; block: string;
}

/** One explicit read source; never falls back to Robinhood's public API. */
export async function proxyBscRead(parts: string[], base: string | undefined, fetcher: typeof fetch = fetch): Promise<Response> {
  const path = parts.join('/');
  if (!/^(capabilities|tokens(?:\/0x[0-9a-fA-F]{40}(?:\/(?:pools|swaps))?)?)$/.test(path)) return Response.json({ error: 'invalid_path' }, { status: 400 });
  const headers = { 'cache-control': 'no-store' };
  if (!base) return Response.json({ error: 'bsc_not_configured' }, { status: 503, headers });
  let url: URL;
  try {
    url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    url.pathname = `/v2/chains/56/${path.toLowerCase()}`;
    if (path === 'tokens') url.search = '?limit=50&status=spot';
  } catch { return Response.json({ error: 'bsc_not_configured' }, { status: 503, headers }); }
  try {
    const response = await fetcher(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000) });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const error = response.status === 404 ? 'token_not_found' : response.status === 503 ? 'chain_data_not_ready' : 'bsc_unavailable';
      return Response.json({ error }, { status: response.status === 404 ? 404 : 503, headers });
    }
    if (body.chainId !== 56) throw new Error('Wrong chain');
    if (path.startsWith('tokens')) {
      const coverage = body.coverage as Partial<BscCoverage> | undefined;
      if (!coverage || coverage.finality !== 'finalized' || !/^\d+$/.test(coverage.fromBlock ?? '') || !/^\d+$/.test(coverage.throughBlock ?? '')) throw new Error('Missing canonical coverage');
      const tokens = path === 'tokens' ? body.tokens : /^tokens\/[^/]+$/.test(path) ? [body.token] : [];
      if (!Array.isArray(tokens) || tokens.some((token) => !token || token.chain_id !== 56 || !/^0x[0-9a-f]{40}$/.test(token.address)
        || typeof token.name !== 'string' || typeof token.symbol !== 'string' || !Number.isInteger(token.decimals)
        || token.decimals < 0 || token.decimals > 36 || !/^\d+$/.test(token.total_supply))) throw new Error('Invalid BSC token');
      if (path.endsWith('/pools') && (!Array.isArray(body.pools) || body.pools.some((pool) => pool.chain_id !== 56
        || !/^0x[0-9a-f]{40}$/.test(pool.id) || !['v2','v3'].includes(pool.dex)))) throw new Error('Wrong pool chain');
      if (path.endsWith('/swaps') && (!Array.isArray(body.swaps) || body.swaps.some((swap) => swap.chain_id !== 56
        || swap.finality !== 'finalized' || !/^0x[0-9a-f]{64}$/.test(swap.tx)
        || !/^\d+$/.test(swap.token_amount) || !/^\d+$/.test(swap.quote_amount)))) throw new Error('Invalid finalized BSC swap');
    }
    return Response.json(body, { headers });
  } catch { return Response.json({ error: 'bsc_unavailable' }, { status: 503, headers }); }
}
