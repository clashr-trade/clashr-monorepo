import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { AccountRole } from '@solana/kit';
import { getTransferSolInstructionDataCodec } from '@solana-program/system';
import { getTransferInstructionDataCodec } from '@solana-program/token';
import { getAddMemoInstructionDataCodec } from '@solana-program/memo';

// Privy's Ethereum entry still imports Solana clients through x402 and wallet funding.
// Load and exercise the real packages so incompatible auto-resolved peers fail here.
describe('Privy wallet dependency compatibility', () => {
  it('provides the Kit exports required by token clients', () => {
    expect(AccountRole.READONLY).toBe(0);
    const codec = getTransferSolInstructionDataCodec();
    expect(codec.decode(codec.encode({ amount: 42n }))).toEqual({ discriminator: 2, amount: 42n });
  });

  it('loads compatible token and memo clients', () => {
    const token = getTransferInstructionDataCodec();
    expect(token.decode(token.encode({ amount: 42n }))).toEqual({ discriminator: 3, amount: 42n });
    const memo = getAddMemoInstructionDataCodec();
    expect(memo.decode(memo.encode({ memo: 'dependency check' }))).toEqual({ memo: 'dependency check' });
  });

  it('loads the x402 client through Privy\'s actual dependency graph', () => {
    const fromWeb = createRequire(import.meta.url);
    const fromPrivy = createRequire(fromWeb.resolve('@privy-io/react-auth'));
    const client = fromPrivy('x402/client') as { createPaymentHeader: unknown };
    expect(client.createPaymentHeader).toBeTypeOf('function');
  }, 30_000); // Cold-loading the complete wallet dependency tree can exceed Vitest's 5s default.
});
