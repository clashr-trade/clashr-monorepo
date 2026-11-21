---
title: Your wallet
description: The wallet you trade from on Clashr, why it's non-custodial, and funding it with BNB.
---

Your Clashr profile and leaderboard row are tied to one wallet address on BNB Smart Chain (chain id 56).

## Which wallet

- **Wallet sign-in:** the browser wallet you signed in with (for example MetaMask) is your member wallet. Trades are sent from it, and your wallet asks you to confirm each one.
- **Privy sign-in (when enabled):** Privy creates an embedded Ethereum wallet for your account, and that embedded wallet is your member wallet. Signing in with MetaMask through Privy only proves your identity; it doesn't move funds from MetaMask into the embedded wallet.

## Non-custodial

- **The key stays with you.** Clashr's servers hold no signing key for anyone, never sign and never send transactions for you.
- **Clashr builds, your wallet signs.** Each approval and each swap needs its own confirmation in your wallet. There are no one-click trades, session keys or unlimited approvals.
- **Signing in isn't a transaction.** The sign-in message is a proof of control only.

## Funding

Trades and gas are paid in **BNB on BNB Smart Chain** (chain id 56). Hold enough BNB in your member wallet for the trade plus gas.

:::caution
Only send BNB on BNB Smart Chain (chain id 56) to your member wallet. Check the network in your wallet before you send.
:::

| | |
| --- | --- |
| Network | BNB Smart Chain |
| Chain id | 56 |
| Gas | BNB |
| Explorer | [bscscan.com](https://bscscan.com) |

:::danger
Never share your private key or seed phrase with anyone. Clashr will never ask for it, and its API rejects any request that looks like it contains one.
:::

## Next

Head to [the trenches](/trading/trenches/).
