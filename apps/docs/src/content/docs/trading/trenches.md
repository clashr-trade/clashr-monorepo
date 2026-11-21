---
title: The trenches
description: The three trenches columns of Flap.sh launches on BNB Chain, and where their data comes from.
---

The trenches show [Flap.sh](https://flap.sh) launches on BNB Smart Chain in three columns:

| Column | What's in it |
| --- | --- |
| **New pairs** | Fresh launches, still trading on their Flap bonding curve. |
| **Almost bonded** | Curves that are at least 50% of the way to completing. |
| **Migrated** | Graduated tokens whose liquidity has moved to a DEX pool; Clashr trades them through PancakeSwap v2/v3. |

Each column holds up to 50 tokens, selected independently, so a burst of new launches doesn't push older almost-bonded or migrated tokens off the board.

## Where the data comes from

- Clashr reads its own API, backed by an index of **finalized** Flap Portal events on BNB Smart Chain (launches, trades, migrations and Portal state). It doesn't scrape a third-party feed.
- Visible trenches pages refresh about every two seconds. Finalized-block confirmation time and RPC latency still apply.
- If the index falls behind (a checkpoint older than 60 seconds, or more than 100 blocks behind), the board shows that the data is stale.
- The index covers launches from its configured start block onward. A token launched before that window may appear without a creation date or creator; Clashr leaves those unknown rather than inventing them.
- Prices are denominated in the curve's quote asset. USD figures are indicative conversions.

## Token cards and signals

Cards link to the [token page](/trading/token-page/), with the token's market data and safety signals such as top-holder concentration, snipers, launch bundles, insiders and fresh wallets. These are computed from Clashr's own index, and each signal shows how complete its data is: checking, partial, retrying or unavailable history is labelled as such, not shown as a measurement. See [Safety checks](/trading/safety-checks/).

Signals describe on-chain data. None of them means a token is safe.
