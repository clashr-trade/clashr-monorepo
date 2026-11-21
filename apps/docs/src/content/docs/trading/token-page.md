---
title: Token page and trading
description: The token page, buying and selling with BNB from your own wallet, quotes, approvals and slippage.
---

Open any token from the trenches or search to see its chart, holders, trades, calls and safety signals, with the trade panel beside them. On mobile, buying and selling opens in a sheet.

## Where your trade goes

| Token state | Venue |
| --- | --- |
| Still on its Flap bonding curve | Your wallet sends the swap **directly to the Flap Portal**, Flap's BNB bonding-curve contract. There's no Clashr router in between. |
| Graduated (migrated) | Your wallet trades through **PancakeSwap**: the official v2 router or the original v3 SwapRouter, whichever direct pool gives the better output. |

Tokens in other Flap states are refused. Wrapping BNB itself isn't a swap.

## Buy and sell

- **Buy:** enter an amount of BNB (the panel can show an indicative USD budget and presets), then **Buy**.
- **Sell:** pick a percentage of your balance or **Max**, or type an amount, then **Sell**.

One Buy or Sell action gets a fresh on-chain quote, checks that your BNB covers the trade plus all gas, simulates it and then asks your wallet to confirm. Your wallet confirms **each** approval and the swap separately.

- **Quotes expire after 60 seconds.** If the quote, the chain, the block or your wallet account changes before signing, the trade stops and you quote again.
- **Approvals are exact.** A sell approves exactly the amount you're selling (resetting an existing insufficient allowance first when needed). There are no unlimited approvals. If you cancel after approving, that exact allowance can stay in place; revoking it is a separate action in your wallet.
- **Minimum output** is enforced on-chain: by the Flap Portal on curve trades, by the router on PancakeSwap trades.

:::note
A delayed wallet confirmation on a curve trade can still execute after the app's 60-second quote window, because the Flap Portal swap has no deadline. The minimum output still applies.
:::

## Quote and settlement details

- **Curve tokens** quoted in BNB buy with BNB and sell for BNB. A curve quoted in another token buys with that token, or with BNB when the curve allows Portal's internal conversion, and sells settle in that quote token. Check the output asset shown in the quote.
- **PancakeSwap trades** are direct native-BNB/token routes. On sells, the router unwraps WBNB and sends BNB to your wallet in the same transaction.
- **Gas** is paid in BNB and shown before you sign.

## Slippage

On PancakeSwap trades, slippage is bounded between 0.01% and 5%. The quote shows the minimum you'll receive after slippage; if the price moves past it, the transaction reverts.

## After the trade

The app checks the receipt and keeps a record of your recent activity in your browser. Supported receipts are also reported to Clashr, which verifies them on-chain. The browser record isn't the platform ledger: leaderboard results come only from verified, finalized trades. See [Leaderboard and seasons](/leaderboard/).
