import { describe, it, expect } from 'vitest';
import {
  normalizeBscActivity,
  normalizeFourMemeActivity,
  candlesFromBscTrades,
} from '../lib/bsc-token-workspace';
const token = '0x' + 'ab'.repeat(20),
  quote = '0x' + 'cd'.repeat(20),
  hash = '0x' + '12'.repeat(32),
  wallet = '0x' + '34'.repeat(20);
describe('BNB token workspace market data', () => {
  it('normalizes quote-side pool trades relative to the requested token and keeps provider amounts in whole tokens', () => {
    const row = {
      id: 'bsc_trade_1',
      attributes: {
        tx_hash: hash,
        tx_from_address: wallet,
        block_timestamp: '2026-11-18T12:00:00Z',
        kind: 'sell',
        from_token_address: quote,
        to_token_address: token,
        from_token_amount: '2',
        to_token_amount: '5000',
        price_from_in_usd: '500',
        price_to_in_usd: '0.2',
        volume_in_usd: '1000',
      },
    };
    expect(normalizeBscActivity({ data: [row, row] }, token)).toEqual([
      expect.objectContaining({ side: 'buy', tokens: 5000, priceUsd: 0.2, usd: 1000, tx: hash }),
    ]);
    expect(normalizeBscActivity({ data: [{ ...row, id: 'solana_trade_1' }] }, token)).toEqual([]);
    expect(
      normalizeBscActivity(
        { data: [{ ...row, attributes: { ...row.attributes, is_anomalous: true } }] },
        token,
      ),
    ).toEqual([]);
    expect(normalizeBscActivity({ data: [row] }, '0x' + 'ff'.repeat(20))).toEqual([]);
  });
  it('uses actual Four.meme token IDs, quote conversion and transaction suffixes without fabricating USD prices', () => {
    const row = {
      tokenId: 123,
      txHash: `${hash}-BID-1`,
      userAddress: wallet,
      side: 'BID',
      createDate: '1795003200000',
      amount: '2000',
      price: '0.001',
      volume: '2',
    };
    const [trade] = normalizeFourMemeActivity([row], 123, 500);
    expect(trade).toMatchObject({ side: 'buy', tx: hash, tokens: 2000, priceUsd: 0.5, usd: 1000 });
    expect(normalizeFourMemeActivity([row], 124, 500)).toEqual([]);
    expect(normalizeFourMemeActivity([{ ...row, txHash: 'invalid' }], 123, 500)).toEqual([]);
    expect(normalizeFourMemeActivity([row], 123, null)[0]).toMatchObject({
      priceUsd: null,
      usd: null,
    });
  });
  it('builds OHLC bars only from real priced trades and sums their actual sampled volume', () => {
    const row = {
      tokenId: 123,
      txHash: `${hash}-BID-1`,
      userAddress: wallet,
      side: 'BID',
      createDate: '1795003200000',
      amount: '2000',
      price: '0.001',
      volume: '2',
    };
    const first = normalizeFourMemeActivity([row], 123, 500)[0]!;
    expect(
      candlesFromBscTrades(
        [{ ...first, time: first.time + 20, priceUsd: 0.75, usd: 200 }, first],
        60,
      ),
    ).toEqual([{ time: first.time, open: 0.5, high: 0.75, low: 0.5, close: 0.75, volume: 1200 }]);
    expect(candlesFromBscTrades([{ ...first, priceUsd: null }], 60)).toEqual([]);
  });
});
