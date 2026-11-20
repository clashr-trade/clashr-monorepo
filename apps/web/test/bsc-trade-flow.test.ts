import { describe, expect, it, vi } from 'vitest';
import { runBscTrade } from '../lib/bsc-trade-flow';

function fixture(side: 'buy' | 'sell' = 'buy') {
  const quote = { id: `quote-${side}`, request: { side, amountIn: 100n } };
  const proof = { quoteId: quote.id, maxGasCostWei: 50n };
  const stages: string[] = [];
  const flow = {
    enabled: true,
    assertCurrent: vi.fn(),
    quote: vi.fn(async () => { stages.push('quote'); return quote; }),
    simulate: vi.fn(async () => { stages.push('simulate'); return proof; }),
    execute: vi.fn(async () => { stages.push('wallet'); return { hash: 'submitted' }; }),
  };
  return { quote, proof, stages, flow };
}

describe('one-action BNB trading', () => {
  it.each(['buy', 'sell'] as const)('prepares and submits a %s from one action', async (side) => {
    const { flow, quote, proof, stages } = fixture(side);
    expect(await runBscTrade(flow)).toEqual({ hash: 'submitted' });
    expect(stages).toEqual(['quote', 'simulate', 'wallet']);
    expect(flow.simulate).toHaveBeenCalledExactlyOnceWith(quote);
    expect(flow.execute).toHaveBeenCalledExactlyOnceWith(quote, proof);
  });

  it('does not quote or request a wallet when deployment signing is disabled', async () => {
    const { flow } = fixture();
    await expect(runBscTrade({ ...flow, enabled: false })).rejects.toThrow(/disabled/);
    expect(flow.quote).not.toHaveBeenCalled();
    expect(flow.execute).not.toHaveBeenCalled();
  });

  it.each(['quote', 'simulate'] as const)('never requests a wallet after a failed %s', async (step) => {
    const { flow } = fixture();
    flow[step].mockRejectedValueOnce(new Error('Insufficient balance or unavailable route'));
    await expect(runBscTrade(flow)).rejects.toThrow(/Insufficient balance/);
    expect(flow.execute).not.toHaveBeenCalled();
  });

  it.each([2, 3])('stops when the wallet/token changes at preparation checkpoint %s', async (checkpoint) => {
    const { flow } = fixture();
    let checks = 0;
    flow.assertCurrent.mockImplementation(() => { if (++checks === checkpoint) throw new Error('Trade changed'); });
    await expect(runBscTrade(flow)).rejects.toThrow('Trade changed');
    expect(flow.execute).not.toHaveBeenCalled();
    if (checkpoint === 2) expect(flow.simulate).not.toHaveBeenCalled();
  });

  it.each([
    { quoteId: 'different-trade', maxGasCostWei: 50n },
    { quoteId: 'quote-buy', maxGasCostWei: 0n },
  ])('refuses an unrelated or invalid simulation budget (case %#)', async (proof) => {
    const { flow } = fixture();
    flow.simulate.mockResolvedValueOnce(proof);
    await expect(runBscTrade(flow)).rejects.toThrow(/Simulation does not match/);
    expect(flow.execute).not.toHaveBeenCalled();
  });

  it('does not retry a rejected or failed wallet submission', async () => {
    const { flow } = fixture();
    flow.execute.mockRejectedValueOnce(new Error('User rejected the request'));
    await expect(runBscTrade(flow)).rejects.toThrow(/User rejected/);
    expect(flow.quote).toHaveBeenCalledOnce();
    expect(flow.execute).toHaveBeenCalledOnce();
  });
});
