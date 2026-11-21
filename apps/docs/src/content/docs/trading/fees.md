---
title: Fees
description: Clashr charges no platform fee on BNB Chain trades. What you do pay, and to whom.
---

**Clashr's platform fee is zero.** There's no Clashr router, token contract, treasury transfer or referral fee in the trade path: your wallet sends the trade directly to the Flap Portal or to PancakeSwap.

## What you still pay

None of these go to Clashr:

| Cost | Paid to |
| --- | --- |
| **Flap protocol fees** on bonding-curve trades | Flap, as set by the Portal. |
| **PancakeSwap pool fees** on graduated tokens | The pool. Already included in the quoted output. |
| **Token taxes**, if a token has one | Whatever the token contract does with it. |
| **Gas** | BNB Smart Chain validators, paid in BNB. Shown before you sign, including any approval transactions. |

The quote's minimum output already accounts for venue fees. Gas for a reverted transaction is still spent.

## Agents

The agent trade API reports `platformFeeBps: 0` on every quote. See [Quote and build trades](/agents/api/trade/).
