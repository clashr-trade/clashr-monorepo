'use client';

import { useEffect, useState } from 'react';
import { API_URL, type TokenCard } from './api';

/** Token search by symbol, name or contract (GET /search), debounced; empty below two characters. */
export const normalizeTokenQuery = (q: string) => q.trim().replace(/^\$+\s*/, '').trim().slice(0, 100);
type SearchResult = { query: string; tokens: TokenCard[]; status: 'idle' | 'loading' | 'ready' | 'error' };

export function useTokenSearchState(q: string): SearchResult {
  const term = normalizeTokenQuery(q);
  const [result, setResult] = useState<SearchResult>({ query: '', tokens: [], status: 'idle' });
  useEffect(() => {
    if (term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`${API_URL}/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then(async (r) => { if (!r.ok) throw new Error('Search unavailable'); return await r.json() as { tokens: TokenCard[] }; })
        .then((d) => { if (!ctl.signal.aborted) setResult({query: term, tokens: d.tokens ?? [], status: 'ready'}); })
        .catch(() => { if (!ctl.signal.aborted) setResult({query: term, tokens: [], status: 'error'}); });
    }, 120);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [term]);
  if (term.length < 2) return {query: term, tokens: [], status: 'idle'};
  return result.query === term ? result : {query: term, tokens: [], status: 'loading'};
}

export function useTokenSearch(q: string): TokenCard[] {
  return useTokenSearchState(q).tokens;
}
