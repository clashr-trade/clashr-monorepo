# BSC spot execution

This stage adds direct native-BNB/token exact-input trading through the official PancakeSwap v2
router and original v3 SwapRouter. It is independent from the Robinhood encoders, assets, treasury,
wallet auth and fee policy. Contract wallets, delegated accounts, multihop/split routes, ERC20 quote
assets, Infinity and launchpad curves are outside this adapter. Wrapped BNB itself is not a swap.

## Quotes and transaction construction

`@rushr/trade/bsc` exports `quoteBscSpot`, `buildBscSpot`, `simulateBscSpot`, `executeBscSpot`,
`verifyBscReceipt` and `reconcileBscSpot`. No SDK function accepts private keys. Callers supply their
own viem clients; the web flow uses an injected EIP-1193 wallet and asks for each confirmation.

Quotes require an explicitly configured BSC mainnet client plus provider `eth_chainId=56`. They pin
factory discovery, router/quoter immutable bindings, pool membership, decimals, liquidity state and
quotes to one fresh block. The provider is trusted for these reads; third-party token cards, prices
and pool hints never admit a route or set a signed minimum. BSC's official public endpoint is an
explicit fallback, rather than an endpoint inherited implicitly from a library upgrade.

Direct v2 and v3 pools compete on output. v3 probes the 100/500/2500/10000 tiers; zero or unquotable
pools are not admitted. Difference from the pool's marginal rate, including venue fees, is computed
from pinned reserves/sqrt-price and capped at 5%. Slippage is separately bounded at 0.01%..5%.
Quote identity binds chain, account, token, side, input, router, pool, fee tier, block/hash, output,
minimum, impact and expiry. Quotes expire after 60 seconds; build/sign checks reject reorganized
quote blocks, changed identities, wallet accounts/networks and expired quotes.

v2 uses the balance-checking `SupportingFeeOnTransferTokens` methods and the router's on-chain quote;
it does not assume Robinhood's fee formula. v3 uses the **original** SwapRouter tuple with a deadline,
not SmartRouter or Universal Router commands. Native buys include refund handling; native sells send
WBNB output to the router then atomically unwrap to the signing account. No quote routes to an
arbitrary recipient/spender, and no BSC call passes through a Robinhood router.

**Platform/referral fees are zero.** Venue fees remain included in the quoted output. No Robinhood
treasury or platform-fee transfer is reused. Charging platform fees requires a separately selected,
verified collection path; a standalone second fee transfer is not fabricated as atomic collection.

## Approval and simulation boundary

Sells read actual allowance, reset a nonzero insufficient allowance when needed, and approve exactly
the input amount. No unlimited allowance, Permit2 grant or session delegation is introduced. Approvals
require individual wallet confirmations. Cancellation/expiry/revert can leave that exact allowance
in place; the UI discloses it, and revocation is a separate user-controlled wallet action.

`eth_simulateV1` runs wallet token-balance probes, the exact approval sequence and the exact swap in
one stateful simulation. It supplies no fake funding, token balances or approval overrides. Native
trace transfers and real token balance changes must satisfy debit/minimum constraints. v3 rejects a
nominal router return that differs from actual wallet output, so transfer-tax/rebasing outputs are
not silently accepted. This is a current-state check, not proof a malicious token cannot change later.
Buy simulation alone is not a round-trip sellability/honeypot assessment; no safety clearance is claimed.
Missing trace support, failed calls, explicit approve(false), unsupported wallets, unsafe output or
insufficient BNB for input plus all gas budgets stop execution. Unsupported RPC does not fall back
to a weaker signable simulation.

Gas is legacy BSC `gasPrice`, with bounded simulated gas and a 30% limit buffer. The review shows the
full approval-plus-swap gas budget in BNB. Execution re-simulates before any sends and again after
approvals. An increased budget requires another review; there is no automatic acceptance/requote.
The signer checks account/network/quote state around awaits and serializes executions for the wallet
client/account. Unmount, account/network change or cancellation stops future signature requests;
already submitted transactions are not undone. There are no automatic send retries.

## Receipt and native accounting

Receipt recovery verifies chain, hash, sender, destination, calldata, value, nonce and canonical block.
Replacement hashes are accepted only if the mined transaction still matches the reviewed intent.
Approval fee attribution is bounded to the reset/exact calls that precede the swap. BNB gas cost is
`gasUsed * effectiveGasPrice`, including reverted transactions. A reverted swap has zero fill, not a
successful trade inferred from a quote. No gas cost is labelled ETH or assigned an invented USD rate.

Successful fill reconciliation requires the selected pool's swap event, token transfer deltas for the
signing wallet, and the official WBNB router deposit/withdrawal. These are receipt-event facts for
standard tokens, not a promise that arbitrary malicious token logs describe honest balances.
Minimum violations are flagged even if the transaction mined successfully. Native amount, token
amount, platform fee zero and network fee BNB remain separate; USD and PnL are explicitly unavailable.
Finality requires the provider's finalized head. Confirmation count alone never changes `mined` to
`finalized`; unsupported finality leaves the record mined.

The browser keeps at most 50 records per BSC account, with reviewed calldata for pending-receipt
rechecks. Reload recovery never replays a signature or transaction. Storage failure retains an
in-memory link and reports that persistence is unavailable. This is **browser-local** activity, not
an authenticated shared platform ledger, referral balance, leaderboard score or global wallet PnL.
Durable server journal/member attribution and reorg-aware financial projections remain backend work.

## UI and rollout

The existing BNB token page now has buy/sell input, wallet connection/network switching, on-chain
quote review, exact approvals, simulation, gas/fee disclosure and receipt activity. Connecting and
read-only previews do not enable signing. The separate signing gate is:

```text
NEXT_PUBLIC_BSC_SWAP_ENABLED=1
```

This is a build-time Next public flag; restart/rebuild for changes. BSC signing is independent from
`NEXT_PUBLIC_PREVIEW_ONLY`: keep that shared-API write protection enabled when browsing Rushr's API.
Keep the independent Robinhood swap flag off and its Privy app ID unset unless that legacy deployment
is separately owned/configured. BSC external-wallet signing itself does not require Privy.
On 2026-11-17, BSC signing was enabled in the local `.env.local` at the user's request. Example files
remain off by default; no production deployment or funded-wallet rehearsal was performed.

Use an explicitly configured BSC provider via server `BSC_RPC_URL` for rehearsal/production. Check
historical calls, `eth_simulateV1` with trace transfers, finalized tags, gas behavior and rate limits.
The browser public fallback is useful for previews, not a production capacity promise. The existing
server RPC proxy still rejects BSC broadcasts; user-confirmed sends use the wallet's provider.
The route CSP now includes BSC and applies per-request nonces/dynamic rendering to all BSC wallet pages.

Before enabling signing, independently rehearse with an owned low-balance EOA and the intended wallet:
v2/v3 buys and sells; exact/reset approvals; wallet rejection; expiry during approval; account/network
change; cancellation/unmount; gas changes; reverted/replaced transactions; receipt recovery/finality;
taxed/unsupported tokens; and provider outages. Read-only simulations and fixtures do not replace this
funded wallet rehearsal. No actual signatures, approvals, deployments or on-chain transactions were
performed during this implementation. One-click, session keys and embedded smart-wallet execution
remain off.

## Reproducible checks

From the repository, with an explicit provider in the environment:

```powershell
pnpm --filter @rushr/trade exec tsx scripts/bsc-spot-smoke.ts
pnpm --filter @rushr/trade exec tsx scripts/bsc-simulation-smoke.ts
pnpm --filter @rushr/trade test
pnpm --filter @rushr/web test
pnpm -r typecheck
```

The first probe verifies deployments and BNB/USDT quotes. The second uses existing state from a
publicly observed funded EOA (or the explicit address `BSC_SMOKE_ACCOUNT`) for **unsigned read-only**
simulations. It never supplies a key, signs, broadcasts or overrides balances; using the address does
not assert ownership. Both v2/v3 native buys were simulated successfully on BSC mainnet during this
stage. Stateful sells, approval races, gas accounting and failure boundaries also have deterministic
fixture coverage. Real funded-wallet signing was not exercised.

## References checked 2026-11-17

- [Pancake v2 deployments](https://developer.pancakeswap.finance/contracts/v2/addresses)
- [Pancake v3 deployments](https://developer.pancakeswap.finance/contracts/v3/addresses)
- [Original v3 swap interface](https://github.com/pancakeswap/pancake-v3-contracts/blob/main/projects/v3-periphery/contracts/interfaces/ISwapRouter.sol)
- [v3 QuoterV2 interface](https://github.com/pancakeswap/pancake-v3-contracts/blob/main/projects/v3-periphery/contracts/interfaces/IQuoterV2.sol)
- [v2 router implementation](https://github.com/pancakeswap/pancake-swap-periphery/blob/master/contracts/PancakeRouter.sol)
- [Stateful simulation/native trace transfers](https://geth.ethereum.org/docs/interacting-with-geth/rpc/ns-eth)
- [BNB RPC endpoints](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/)
