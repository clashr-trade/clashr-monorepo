import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isBscPath, terminalNavigation, terminalNetworkDestination, terminalSection } from '../lib/terminal-navigation';
import { BscFeatureState } from '../components/terminal/bsc-feature-state';

describe('chain-scoped terminal navigation', () => {
  it('exposes the same five sections with BNB-only destinations from every BNB route', () => {
    for (const path of ['/bsc', '/bsc/feed', '/bsc/agents', '/bsc/leaderboard', '/bsc/rush', '/bsc/token/0x123', '/bsc/indexed']) {
      const navigation = terminalNavigation(path);
      expect(navigation.map(item => item.label)).toEqual(['Trenches', 'Feed', 'Agents', 'Leaderboard', 'Rush']);
      expect(navigation.map(item => item.href)).toEqual(['/bsc', '/bsc/feed', '/bsc/agents', '/bsc/leaderboard', '/bsc/rush']);
      expect(navigation.filter(item => item.active)).toHaveLength(path === '/bsc/indexed' ? 0 : 1);
    }
  });
  it('preserves the selected section in both network-switch directions', () => {
    for (const section of ['feed', 'agents', 'leaderboard', 'rush']) {
      expect(terminalNetworkDestination(`/${section}`, 56)).toBe(`/bsc/${section}`);
      expect(terminalNetworkDestination(`/bsc/${section}`, 4663)).toBe(`/${section}`);
    }
    expect(terminalNetworkDestination('/trenches', 56)).toBe('/bsc');
    expect(terminalNetworkDestination('/bsc', 4663)).toBe('/trenches');
  });
  it('never carries a token contract or indexer path to another chain', () => {
    expect(terminalNetworkDestination('/bsc/token/0x123', 4663)).toBe('/trenches');
    expect(terminalNetworkDestination('/token/0x123', 56)).toBe('/bsc');
    expect(terminalNetworkDestination('/bsc/indexed/token/0x123', 4663)).toBe('/trenches');
    expect(terminalSection('/bsc/token/0x123')).toBe('trenches');
  });
  it('matches route boundaries instead of similar prefixes', () => {
    expect(isBscPath('/bscam')).toBe(false);
    expect(terminalSection('/bsc/feed-other')).toBeNull();
    expect(terminalNavigation('/feed')[1]).toMatchObject({ href: '/feed', active: true });
    expect(terminalNavigation('/leaderboard')[3]).toMatchObject({ href: '/leaderboard', active: true });
  });
});

describe('unavailable BNB product services', () => {
  it.each(['feed', 'leaderboard', 'rush'] as const)('%s shows an explicit chain-specific state with only BNB navigation', feature => {
    const html = renderToStaticMarkup(createElement(BscFeatureState, { feature }));
    expect(html).toContain('Not available on BNB');
    expect(html).toContain('BNB Smart Chain');
    expect(html).toContain('Robinhood');
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    expect(hrefs).toEqual(['/bsc', '/bsc/agents']);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<form');
  });
});
