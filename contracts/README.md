# CLASHR contracts: BNB Chain and Flap

Clashr currently sends wallet-confirmed trades directly to Flap's BNB bonding-curve Portal. There is no Clashr-owned swap router, token contract, treasury transfer or platform fee on this path. Protocol fees, token taxes and BNB gas still apply. The user selected this direct-trading model for the contract update.

## Current integration

- Network: BNB Smart Chain mainnet, chain ID **56**.
- Bonding-curve Portal and approval spender: **`0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`**.
- `src/flap/IFlapPortal.sol` declares the supported Portal v5 read, quote and swap ABI, token-state tuple, fill events and documented errors.
- `src/flap/FlapBNB.sol` contains integration constants only. Neither file introduces a Clashr trading contract to deploy.
- The executable adapter remains [`packages/trade/src/bsc/flap.ts`](../packages/trade/src/bsc/flap.ts). The Solidity declaration is checked against its compiled ABI so the two stay compatible.
- Graduated tokens use supported PancakeSwap v2/v3 routes in the existing spot adapter. The current application does not send their trades through the curve Portal, VaultPortal or the separate Flap Pool Launch Portal.

## Call and settlement rules

Wallets send `swapExactInput` directly to Portal. Native input uses `address(0)` and `msg.value = inputAmount`; ERC-20 input uses zero value and an exact approval to Portal, with an allowance reset when necessary. Clashr sends empty `permitData` and never asks for a router approval on this path.

A BNB-quoted curve buys with BNB and sells for BNB. An ERC-20-quoted curve buys with its quote asset, or with BNB only when `nativeToQuoteSwapEnabled` permits Portal's internal conversion. Sells settle in the curve's quote asset. Read its decimals instead of assuming 18.

The supported curve status is `1` (tradable). Status `4` requires the supported DEX adapter; other states are refused. The SDK also checks supported extensions, the trader's NFT gate and remaining buy quota, chain identity, quote freshness, real balances, net outputs and gas budgets. These client safeguards are not supplied by this Solidity interface.

`quoteExactInput` is non-view but is read through `eth_call`; do not send it as a paid transaction. Portal's swap struct has no deadline or recipient. Minimum output is enforced by Portal, while quote expiry is checked by the application before requesting a wallet signature. A delayed wallet confirmation can execute after that local window.

`TokenBought` and `TokenSold` have no indexed fields. Receipt checks require the canonical Portal, exactly one matching fill and the expected trader and token. Event `eth`/`fee` values use the curve's quote-asset units, including BNB-to-ERC-20 hop buys; they do not prove BNB spend for those buys. The SDK retains that distinction in its accounting.

## Build and test

The default Foundry profile and its `bnb` alias now target **Flap**, with Solidity 0.8.26, optimizer 10,000 and Cancun EVM support. They need no `forge-std` installation. From this directory:

```sh
forge fmt --check src/flap test/flap
forge build --sizes
forge test -vv
```

From the repository root, after the default contract build and workspace dependency installation:

```sh
pnpm --filter @clashr/trade exec tsx ../../contracts/scripts/check-flap-abi.mjs
```

The ABI check compares the Portal address, all seven functions (including tuple order, widths, names and mutability), and both fill events (including indexing) against compiler output. Unit tests independently pin published selectors, the eighteen-word state layout and event topics/data. They do not simulate Flap's pricing or prove production swap execution.

Fork tests are explicitly skipped without `BSC_RPC_URL`. Set it to a trusted BNB mainnet endpoint to check the deployed Portal major version. Set `FLAP_FORK_TOKEN` to an existing Flap token to also check its state, NFT gate and quota read surface. Optional `FLAP_FORK_BLOCK` pins a block. These tests only read a local fork; they do not approve tokens, send swaps, sign or broadcast. In PowerShell:

```powershell
$env:BSC_RPC_URL = 'https://your-bnb-rpc'
$env:FLAP_FORK_TOKEN = '0xYourExistingFlapToken'
forge test --match-contract FlapPortalForkTest -vv
```

The repository's active [CI workflow](../.github/workflows/ci.yml) builds/tests this profile and checks SDK ABI parity. Fork checks run only when a BNB RPC secret is configured. The workflow under `contracts/.github` is relevant only if this directory is extracted as a separate repository.

## Other sources in this directory

`src/ClashrLegacyRouter.sol`, `src/ClashrLegacyPonsRouter.sol`, `src/TreasuryTimelock.sol` and their tests are retained drafts outside the BNB/Flap integration. The default profile does not compile them; they build only under `FOUNDRY_PROFILE=legacy`, which needs `forge-std` installed in `lib/`. Do not point them at Flap or reuse their fee/treasury settings.

Changing the Foundry default does not alter SDK transaction targets, wallet permissions, contract bytecode already deployed elsewhere, or database state. Reverting this workspace change restores the previous build selection; no on-chain or data rollback is required.

## Sources and review

Local validation on 2026-11-20: all 7 Flap tests passed, including 2 read-only BNB fork checks at block `134682954` against Portal `v5.27.2`; all 22 SDK Flap tests passed. Formatting, build, SDK ABI parity and checker lint passed. Paris fork execution failed on the live Portal; Cancun execution passed, so the current profile uses Cancun.

Verified against Flap's published [BNB contract addresses](https://docs.flap.sh/en/flap/v2/developers/deployed-contract-addresses), [Portal interface](https://github.com/flap-sh/flap-skills/blob/main/trade-flap-token/references/interface.md), [token-state rules](https://github.com/flap-sh/flap-skills/blob/main/trade-flap-token/references/token-state.md) and [receipt semantics](https://github.com/flap-sh/flap-skills/blob/main/trade-flap-token/references/receipt.md) on 2026-11-20. Portal is an external upgradeable dependency: the address alone does not pin its implementation forever.

This work is not an independent audit and makes no new deployment or token-launch claim. License: [AGPL-3.0-only](LICENSE); preserve upstream attribution in the retained sources.
