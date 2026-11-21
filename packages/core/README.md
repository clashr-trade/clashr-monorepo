# @clashr/core

Clashr chain configuration, PancakeSwap event definitions, event decoding, token metadata, position accounting and safety primitives for BNB Chain. This package has no servers, signing keys or databases.

| Path | What |
| --- | --- |
| `src/chain/networks.ts` | Explicit network lookup (`getNetwork`) for BNB Smart Chain mainnet (56) and testnet (97); unknown chains are rejected rather than defaulted |
| `src/chain/pancake.ts` | PancakeSwap v2/v3 mainnet factories, wrapped BNB, ABIs and event topics |
| `src/chain/bsc-rpc.ts` | The official public BNB Chain RPC endpoint, used only when no provider is configured |
| `src/ingest/decode.ts` | Turns raw logs into launches, pools, swaps, migrations and transfers, including contracts without public ABIs (decoded by layout) |
| `src/ingest/metadata.ts` | Finds a token's icon, website, X and Telegram from launch calldata, `tokenURI` and IPFS metadata |
| `src/pnl/position.ts` | Average-cost position and realized-PnL accounting (`applyTrade`) |
| `src/signals/compute.ts` | Safety signals and the plain-language risk verdict |

## Safety signals

Computed from on-chain data only (the Flap safety pipeline uses `computeSignals`):

- **Snipers**: wallets (other than the dev) that bought in the first 5 seconds.
- **Bundle**: buys in the first 3 blocks after launch, plus early buyers sharing a funder with them or the dev.
- **Insiders**: holders funded by the dev or by the dev's own funder.
- **Fresh wallets**: holders first funded within 24 hours of launch.
- **Dev record**: the deployer's other launches, how many rugged (−90% drawdown), and serial launching (5+ in 7 days).
- **Spam clones**: plain pools with 20+ airdropped holders, excluded from copycat checks.
- **Top 10 holders %**, excluding pools, routers and burn addresses.

The thresholds live in `THRESHOLDS` in `src/signals/compute.ts`. They are public on purpose: if you think one is wrong, open an issue with a token that proves it.

## Use it

```bash
npm install
npm test              # decoders, metadata and signals
npm run typecheck
```

```ts
import { decodeLogs, computeSignals, getNetwork } from './src';
```

## Contributing

Issues and PRs are welcome, especially:

- a contract we don't recognise yet (include a transaction hash),
- a token where a signal is clearly wrong,
- decoder fixes with a test.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a service, you must publish your changes too. Portions derive from an upstream AGPL-3.0 project and remain under that license.
