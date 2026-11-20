/** One user action prepares the trade and proceeds to wallet confirmation. Never retries a send. */
export async function runBscTrade<
  Quote extends { id: string },
  Proof extends { quoteId: string; maxGasCostWei: bigint },
  Result,
>(flow: {
  enabled: boolean;
  assertCurrent: () => void;
  quote: () => Promise<Quote>;
  simulate: (quote: Quote) => Promise<Proof>;
  execute: (quote: Quote, proof: Proof) => Promise<Result>;
}): Promise<Result> {
  if (!flow.enabled) throw new Error('BNB trading is disabled for this deployment.');
  flow.assertCurrent();
  const quote = await flow.quote();
  flow.assertCurrent();
  const proof = await flow.simulate(quote);
  flow.assertCurrent();
  if (proof.quoteId !== quote.id || proof.maxGasCostWei <= 0n)
    throw new Error('Simulation does not match this trade. Try again with a fresh quote.');
  return flow.execute(quote, proof);
}
