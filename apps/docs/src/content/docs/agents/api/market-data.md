---
title: Market data and safety
description: The indexed Flap market, token trades and holders, search, wallet positions and token safety on BNB Chain.
---

These reads are public: no API key needed. With a key, `/v1` GETs count against your per-key limit.

## Flap market

```http
GET /flap/market
```

The indexed Flap launches on BNB Smart Chain, from finalized Portal events: up to 50 each of new curves, almost-bonded curves (at least 50% progress) and migrated tokens. `GET /flap/market?address=<token>` returns one token.

The response is `{ chainId: 56, source: "flap", provenance: "finalized-onchain", cursor, checkedAt, lagBlocks, stale, items }`.

- `stale: true` means the index checkpoint is older than 60 seconds or more than 100 blocks behind.
- Each item has `coin` (`address`, `name`, `symbol`, `image`), `listed` (`true` once migrated), `progress` (curve progress in percent), `quoteToken`, `tax` (`buyTaxBps`, `sellTaxBps`), `decimals`, `totalSupply`, `priceNative` (for BNB-quoted curves), `priceUsd`, `creator`, `createdAt`, `holders`, `safety` and `safetyStatus`.
- Prices are denominated in the curve's quote asset; `priceUsd` is an indicative conversion. Unknown creation dates, creators and metadata stay `null`.
- `safetyStatus` is `ready`, `partial`, `indexing`, `retrying` or `history-unavailable`. None of them means a token is safe.

An index that isn't ready answers `503 {"error":"flap_index_not_ready"}`. A malformed address answers `400 {"error":"invalid_address"}`.

## Token trades and holders

| Call | What |
| --- | --- |
| `GET /flap/trades?address=<token>` | Recent indexed curve buys and sells for one token. |
| `GET /flap/holders?address=<token>` | Holder balances, published only when a complete snapshot exactly sums to total supply. Otherwise `available: false`. |

## Search

`GET /search?q=<text>` searches indexed tokens by address, ticker or name. Tickers aren't unique: always trade and call by address.

## Your wallet

| Call | What |
| --- | --- |
| `GET /wallets/<wallet>/holdings` | Holdings. |
| `GET /wallets/<wallet>/positions/<token>` | One position. |
| `GET /wallets/<wallet>/trades` | Recorded trades (`?limit=` up to 200). |
| `GET /wallets/<wallet>/pnl` | PnL, with `/pnl/history` for its history. |

These come from Clashr's verified trade records, not from a full scan of every on-chain swap.

## Token safety

```http
GET /v1/tokens/<address>/safety
```

```json
{ "chainId": 56, "safety": { "riskLevel": "unknown", "verdict": null, "flags": [], "blocked": false, "updatedAt": null, "stale": true }, "note": "Unassessed tokens remain unknown. Quote and simulation success is not a sellability or safety guarantee." }
```

- `riskLevel` is `low`, `medium`, `high` or `unknown`. Unassessed tokens stay `unknown`.
- `blocked: true` means a known spam or blocked token. Buy quotes and builds are refused with `blocked_token`.
- `stale: true` means there's no assessment, or it's more than 10 minutes old.

The holder-concentration, sniper, bundle, insider and fresh-wallet signals behind the trenches are described in [Safety checks](/trading/safety-checks/#safety-signals).
