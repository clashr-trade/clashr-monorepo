---
title: Safety checks
description: The checks Clashr runs before your wallet signs, price impact and token taxes, and the safety signals from its Flap index.
---

Clashr checks every trade before your wallet signs it. These checks are information and guard rails, not guarantees: meme tokens are extremely risky, and no check proves you'll be able to sell later.

## Before you sign

- **Chain and contracts.** Quotes need a BNB Smart Chain provider that reports chain id 56. PancakeSwap factories, routers, quoters and pools are checked and pinned to one fresh block; third-party token cards, prices or pool hints never choose a route or set your minimum.
- **Curve state.** Flap curve trades are only built for a tradable curve. The SDK also checks the token's supported extensions, any NFT gate and remaining buy quota for your wallet.
- **Fresh quote.** Quotes expire after 60 seconds. A changed block, quote, wallet account or network stops the trade.
- **Stateful simulation.** Before any signature, the exact approval sequence and the exact swap are simulated together against your real balances, with no fake funding. Not enough BNB for the trade plus all gas, a failed call, unsafe output, or an RPC that can't run the simulation stops the trade; there's no weaker fallback.
- **Re-check during execution.** The trade is simulated again before sending and after approvals. If the gas budget rises, the attempt stops instead of retrying.

:::caution
A successful buy simulation is not a round-trip sellability or honeypot check, and a successful historical sell doesn't prove a future sell will work. Clashr makes no safety clearance.
:::

## Price impact and pool tax

Price impact is how much worse your price is than the pool's current rate, because of your trade.

- On PancakeSwap routes, Clashr computes it from the pinned reserves or price, **including the pool's own fee**, and refuses routes whose impact is above 5%.
- **Token taxes** (transfer taxes) aren't a pool fee. On v2 routes, the balance-checking router methods handle fee-on-transfer tokens. On v3 routes, if the wallet would receive less than the router's nominal output (for example from a transfer tax or rebasing), the trade is refused rather than silently accepted.
- On a Flap bonding curve, the Portal's own fees and any token tax are part of the curve quote. Check the minimum output before you sign.

## Safety signals

Token pages and cards show signals computed from Clashr's own index of finalized Flap events and token balances on BNB Smart Chain:

- **Top-holder concentration**, excluding the Flap Portal, the token itself, its migration pool, burn addresses and other contracts. Burned tokens are removed from circulating supply.
- **Snipers**, using a five-second rule after launch, and **launch bundles** (a three-block heuristic, not evidence of coordination).
- **Insiders, fresh wallets and funding-linked bundles**, only when the wallet funding history is complete enough.

Each signal shows how complete its data is. Missing launch history or funding coverage stays **unknown** instead of being guessed. Snapshots are refreshed in the background and are at most five minutes old when shown, with their checkpoint and computation time.

Clashr doesn't infer an overall risk verdict, contract source verification, renunciation status or a honeypot pass. The rules are plain code in `packages/core/src/signals`, with fixture tests.
