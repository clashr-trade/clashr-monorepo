# Robinhood Chain → BNB Smart Chain refactor plan

Date: 2026-11-17. Scope: implementation plan only; no application, contract, dependency, infrastructure, or database changes are performed by this document.

## 1. Target, assumptions, and compatibility policy

**Assumption:** “BNB Chain” means BNB Smart Chain (BSC), not opBNB. Target mainnet is chain ID **56**, native currency **BNB**; use BSC testnet **97** for deployment rehearsals. These identifiers and explorers are documented in the [BNB wallet configuration guide](https://docs.bnbchain.org/bnb-smart-chain/developers/wallet-configuration/).

**Recommended approach:** introduce explicit chain support, preserve Robinhood Chain 4663 as a legacy network, and switch the new product experience to BSC only after validation. Avoid replacing every occurrence of `4663`, `ETH`, or a contract address globally.

Interpret backward compatibility as:

- Existing Robinhood records, balances, PnL, links, member identities, and historical seasons retain their original meaning.
- Existing API/SDK/MCP clients continue to target Robinhood unless they explicitly opt into the new chain-aware interface. An old request must never execute on BSC silently.
- The new application can default to BSC. Explicitly linked Robinhood tokens still open on Robinhood.
- Existing deployed contract ABIs, if any are independently discovered, remain address- and chain-bound. Contract migration does not imply proxy upgradeability.
- Backward compatibility does not mean the same ERC-20, wallet balance, liquidity, approval, or native asset exists on both chains.
- Initial migration support includes reading Robinhood history. Keeping Robinhood trading enabled long term is a product/operations decision, not a prerequisite for BSC trading. If disabled later, legacy writes return an explicit documented status.

**Not assumed:** ownership of upstream production infrastructure, control of existing token contracts, access to a production database, BSC deployment of PONS/lift.fun, or permission to bridge user assets. The current fork is a browsing preview using the upstream API; an independent BSC backend must be provisioned.

## 2. Findings verified in the current repository

- `packages/core/src/chain/robinhood.ts` combines chain metadata, RPC/explorer URLs, native/quote assets, reference pools, factories, ABIs, launchpad definitions, and event topics. It includes 4663-specific block timing and confirmation assumptions.
- `packages/trade/src/chain.ts`, `addresses.ts`, and `config.ts` bind trading to Robinhood, ETH/WETH/USDG, specific Uniswap deployments, Permit2, and the upstream treasury. `types.ts` limits quote assets to `ETH | USDG` and venues to Uniswap/PONS.
- `packages/trade/src/universal-router.ts` and `contracts/src/RushrRouter.sol` encode a particular Universal Router command/action format. Shared router names do not establish ABI, factory, init-code-hash, or encoding compatibility.
- **Contract scope correction:** `contracts/README.md` and `contracts/REVIEW.md` describe `RushrRouter`, `RushrPonsRouter`, and `TreasuryTimelock` as draft, unaudited, and not deployed. The documented live path uses third-party Uniswap contracts and direct PONS curve calls. This is repository evidence, not an independent audit of upstream production.
- `contracts/foundry.toml` fixes Solidity 0.8.26 and the Cancun EVM target. Validate the exact BSC execution environment and required opcodes before reusing those build settings.
- `packages/trade/src/fast-send.ts` caches nonce/fees and assumes an Arbitrum-style base-fee path with optional synchronous broadcasting. `simulate.ts` uses `eth_simulateV1`; neither feature can be assumed available from a chosen BSC provider.
- `packages/db/src/schema.ts` uses address-only token keys, pool-ID-only pool keys, `(tx, log_index)` swaps/transfers, `(wallet, token)` positions, and unscoped wallet/candle/signal/indexer-state identities. `trades_ledger` already has `chain_id`, but that alone does not make the schema chain-safe.
- Social/auth tables also exist in `packages/db/migrations/0007_agents.sql` and later migrations, and are accessed through raw SQL, including `packages/agents/src/sql.ts` and indexer agent handlers. Drizzle schema edits alone will miss dependencies.
- `apps/indexer/src/env.ts` names Durable Objects independently of chain (`main-apac`, `pools`, `positions`, `holders`). `hydrator.ts` keys hydration by token and uses a global RPC budget. `gateway.ts` names gateway shards without chain context.
- `packages/agents/src/siwe.ts` hardcodes chain 4663 and `rushr.trade` as the signing domain/URI. Changing a UI network selector will not change authentication verification safely.
- Web RPC, auth, balances, formatting, settings, feeds, and links embed Robinhood/ETH assumptions. `packages/mcp/src/config.ts` also defaults to Robinhood and `RUSHR_GAS_RESERVE_ETH`.

## 3. Release strategy and implementation order

Implement as independently reviewable changes in this order:

1. Baseline and product decisions.
2. Chain/protocol model and verified registries.
3. Additive data migration and chain-scoped identities.
4. Versioned APIs and real-time protocol compatibility.
5. BSC discovery/indexing and pricing.
6. BSC trade adapters and provider capabilities.
7. Contract adaptation/deployment, only if the selected execution path needs custom contracts.
8. Authentication, wallets, agents, and signing policies.
9. UI, settings, caches, and compatibility links.
10. Accounting, social history, and seasons.
11. Integrated validation and migration rehearsal.
12. Staged production cutover.
13. Compatibility-window completion and cleanup.

After step 2, contract research can proceed alongside schema/API design. Enable BSC execution only after indexing, pricing, signing, execution, and accounting gates all pass. Do not enable BSC trades against the upstream Robinhood-only public API.

### Step 1 — Freeze the baseline and decide launch scope

**Dependencies:** none.

1. Record the source revision, current package versions, environment settings without secrets, schema version, API fixtures, WebSocket fixtures, and screenshots of critical flows. Preserve previous dependency and avatar-hydration fixes.
2. Inventory every chain-bound reference with searches for `4663`, `robinhood`, `ETH`, `WETH`, `USDG`, contract addresses, SIWE constants, RPC method names, explorer URLs, state/cache keys, and raw SQL joins/conflict clauses. Categorize each as shared, Robinhood-only, or chain-dependent.
3. Decide BSC launch coverage: recommend PancakeSwap v2/v3 spot trading first. Treat Infinity, other DEXs, aggregators, and launchpad curves as separately tested adapters, not address substitutions.
4. Choose which BSC launchpad(s), if any, will supply launch and bonding events. Full trenches parity requires genuine launch, curve-progress, graduation, and post-graduation data. If deferred, explicitly flag the unavailable bonding feature and do not claim full feature parity.
5. Decide whether Robinhood trading continues, how long legacy APIs remain supported, which domains belong to this fork, and whether historical upstream data can actually be imported. If unavailable, preserve supported upstream read links or show an explicit history-availability limit.

**Deliverables:** chain-assumption inventory, feature-parity checklist, API compatibility policy, rollback baseline, and approved venue shortlist.

**Acceptance:** the team can distinguish “BSC spot MVP” from “full launchpad/social/trading parity,” and no dependency on inaccessible upstream state is hidden.

### Step 2 — Introduce chain context and protocol-specific registries

**Dependencies:** step 1.

1. Extract shared ABIs/event definitions where genuinely common. Retain Robinhood-specific registry exports as legacy compatibility entry points.
2. Define immutable chain configuration for 4663, 56, and testnet 97: native metadata, wrapped-native asset, supported quotes with individual decimals, explorer/market-data identifiers, RPC policy, gas strategy, finality policy, and enabled adapters.
3. Separate chain configuration from venue deployment configuration. A deployment entry should include protocol family/version, factory, router, quoter, Permit2, pool manager if relevant, factory deployment block, allowed fees, supported token behavior, and verified source/bytecode evidence.
4. Populate BSC entries only after checking official deployment documentation and on-chain code at a recorded block. Verify router-embedded factories and pool derivation, proxy implementation if applicable, wrapped-native behavior, and allowance spenders. Fail startup on inconsistent chain IDs or missing required deployments.
5. Replace implicit global trade defaults with a resolved chain context passed into discovery, quote, build, simulation, signing, fee audit, and receipt interpretation.
6. Use chain-qualified asset identity `(chainId, address)` and native asset metadata. Do not model BNB as an alias for ETH. Preserve old ETH-named exports only inside the Robinhood compatibility interface.

**Primary files:** `packages/core/src/chain/robinhood.ts`, `packages/core/src/index.ts`, `packages/trade/src/{chain,addresses,config,types}.ts`.

**Acceptance/tests:** loading all configurations has no network side effects; invalid chain/provider combinations fail; the same address resolves independently on 56 and 4663; the legacy exported interface retains its existing semantics.

### Step 3 — Make persistence chain-safe with an expand–migrate–contract process

**Dependencies:** step 2; complete before storing any BSC data in shared storage.

1. Inventory both Drizzle tables and migration-only/social tables, plus every raw SQL reader/writer. Map constraints, indexes, joins, upserts, foreign references, deduplication, and aggregate rebuild paths.
2. Introduce chain-qualified successor tables or an equivalent explicitly versioned schema. Recommended identities:
   - Tokens: `(chain_id, address)`; pools: `(chain_id, protocol, pool_id)` where needed to distinguish protocol-specific pool managers.
   - Swaps/transfers: `(chain_id, tx_hash, log_index)` with block hash and canonical/finality status for reorg handling.
   - Positions/balances/backfills: include chain with wallet/token; candles: include chain, token, interval, and bucket; signals/deployer statistics: chain-bound.
   - Wallet PnL: separate per-chain results from an explicitly defined cross-chain USD aggregate.
   - Indexer state/cursors: include chain, adapter/job, and version. Ledger uniqueness and fee attribution must include chain, including follow-up fee transactions.
3. Keep global members, handles, follows, and authentication identities global unless there is a specific reason to split them. Add chain-bound wallet/account configuration and token references to callouts, tracked entries/exits, season definitions, referrals/payout accounting, and cached standings as appropriate.
4. Mark verified legacy on-chain rows as 4663. Backfill in bounded resumable batches; quarantine ambiguous rows. Historical `price_eth`, ETH gas costs, native amounts, and USD snapshots must retain their original units and provenance.
5. Avoid a rolling deployment where old address-only writers collide with new composite conflict targets. Keep legacy tables operational initially; use a transactional outbox/change-capture path to mirror 4663 changes into the successor schema while BSC writes only to the new schema. Assign a single authoritative writer per chain during each stage.
6. Reconcile counts, keys, balances, positions, PnL, and checksums to a captured watermark. Move new readers, then Robinhood writers, only after reconciliation. Keep rollback-compatible legacy reads or projections for the agreed window. Do not introduce uncontrolled bidirectional writes.
7. Plan constraints/index builds and lock budgets against a production-sized copy; measure storage growth and backfill performance. Delay destructive column/table removal until step 13.

**Primary files:** `packages/db/src/schema.ts`, `packages/db/migrations/`, `packages/agents/src/{sql,pnl,leaderboard}.ts`, indexer raw SQL modules.

**Acceptance/tests:** same token address, pool ID, transaction hash, wallet, and candle timestamp on two chains never collide. Restarted backfills are idempotent. Existing Robinhood totals match before/after at the same watermark. Restore and writer-handoff drills succeed.

### Step 4 — Add a chain-explicit API and real-time contract

**Dependencies:** steps 2–3.

1. Inventory the existing unversioned market endpoints and `/v1` member/trade endpoints. Preserve their Robinhood interpretation; a missing chain field in a legacy request must not mean BSC.
2. Introduce a new versioned interface, for example `/v2/chains/:chainId/...`, and explicit chain fields for trade/agent mutations. Return chain, asset units, protocol/version, and contract context in quote/build responses.
3. Bind prepared trades and quote IDs to chain, account, token, spender/router, route, slippage, expiry, and relevant configuration version. Reject route/chain/request mismatches at build and submission.
4. Version WebSocket topic names, snapshots, deltas, cursors, and sequence epochs with chain identity. Route old subscribers to 4663 and new subscribers to explicit chain topics; never interleave unlabelled BSC events with old topics.
5. Add chain to job payloads, idempotency keys, dead-letter records, API cache keys, and rate-limit accounting where resource scope requires it. Preserve a global abuse-control layer as well.
6. Publish capability discovery so a client can distinguish unsupported venue, history unavailable, simulation unavailable, paused trading, and unsupported chain. Include a published legacy sunset policy rather than silently changing defaults.

**Primary files:** `apps/indexer/src/{api,index,env,feed,gateway}.ts`, `apps/indexer/src/agents/`, `apps/web/lib/api.ts`, `apps/web/lib/feed/{protocol,client,topics}.ts`, MCP API clients.

**Acceptance/tests:** captured old requests/responses still work against Robinhood; BSC requests require chain context; mixed-version sockets remain isolated; delayed/retried old queue messages cannot be interpreted as BSC jobs.

### Step 5 — Implement a BSC indexer and correct native pricing

**Dependencies:** steps 2–4.

1. Provision an independent BSC RPC provider supporting the required log history, subscriptions, archive access, and tracing/simulation features. Probe actual limits and methods. Public BSC endpoints have documented log-query restrictions; they are not a sufficient assumed indexer backend. See [BNB RPC endpoints](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/).
2. Namespace every Durable Object, persisted cursor, hydration job, gateway shard, and RPC budget by chain/version. Do not reuse Robinhood cursor values or DO storage for BSC.
3. Configure starting blocks per verified factory deployment or explicit discovery window. Tune range sizes, polling, catch-up budgets, provider quotas, and subscriptions from measured BSC behavior rather than Robinhood's 0.11-second assumptions.
4. Implement PancakeSwap factory/pool discovery and version-specific swap decoders. Reuse v2/v3 decoder primitives only where fixtures prove compatibility; the existing Pancake-v3 event decoder is useful groundwork, not end-to-end BSC support.
5. Verify event-emitting contracts and factory membership. Do not admit a fake pool solely because its event topic resembles an allowed DEX.
6. Add selected launchpad-specific discovery, creator attribution, curve pricing, migration mapping, and metadata adapters. Disable Robinhood-only PONS/lift.fun and stock-token enrichment on BSC unless independently supported.
7. Track block hashes and parent continuity, process removed logs, rewind affected canonical data, and rebuild downstream balances/candles/signals/PnL after reorgs. Separate provisional UI updates from finalized accounting. Select a provider-tested finality policy using [BNB finality APIs](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/bsc-api-list/); do not hardcode timing estimates from documentation as guarantees.
8. Replace ETH/USD reference-pool assumptions with BNB/USD pricing from validated liquid sources. Validate quote-token addresses and decimals individually; do not assume a stablecoin is always worth $1. Persist price timestamp/source, stale/depeg limits, and behavior when valuation is unavailable.
9. Recalibrate safety signals on BSC fixtures, including taxed/rebasing/blacklist tokens and unreliable metadata. Keep unsupported measurements unknown, not “low risk.”

**Primary files:** `apps/indexer/src/{poller,pipeline,rpc,env,hydrator,gateway,metadata,signals,supply,wallet-history,curves,liftfun}.ts`, `packages/core/src/ingest/`, chain registries.

**Acceptance/tests:** replayed fixtures produce correct launches/swaps/holders/candles; duplicate logs are harmless; reorg and reconnect recovery converge; stale prices cannot authorize USD-capped trades; unsupported bonding views are explicitly unavailable.

### Step 6 — Refactor quoting, approvals, simulation, gas, and broadcasting

**Dependencies:** steps 2–5.

1. Separate discovery, quote, encoding, allowance, simulation, and receipt-decoding interfaces per protocol/version. Add Pancake v2/v3 adapters without changing legacy Uniswap/PONS encodings.
2. Verify actual v2 fees, v3 fee tiers, token ordering, callback validation, native wrapping/unwrapping, and recipient semantics. Replace fixed fee tiers/math only through the selected venue configuration.
3. Treat Pancake Infinity as its own adapter. Its Vault/pool-manager/hook architecture differs from a generic Uniswap-v4 assumption; see the [Infinity overview](https://developer.pancakeswap.finance/contracts/infinity/overview). Do not send existing v4 commands to it by changing addresses.
4. Bind ERC-20 and Permit2 approvals to exact chain, token, spender, amount, and expiry. Read new allowances on BSC; a Robinhood approval conveys no BSC authorization. Distinguish Pancake-specific and other Permit2 deployments rather than assuming the universal-looking address is correct everywhere.
5. Implement a BSC gas strategy that supports the transaction types accepted by the selected network/provider. Remove the assumption that tips can be ignored. Use provider-aware gas estimation, native reserves, replacement rules, and conservative bounds; keep the Robinhood strategy available.
6. Scope nonce queues, cached fees, balances, prepared quotes, and in-flight transactions by `(chainId, account)`. On chain/account change, cancel stale prebuilds and require revalidation before signing. Never reset a still-pending nonce queue merely because the UI switched chains.
7. Probe optional RPC capabilities. Prefer standard raw-transaction submission plus receipt polling when synchronous send is unavailable. Preserve signed-byte validation against chain, target, calldata, value, nonce, gas, and fees.
8. Rework honeypot/tax and buy→sell simulation for available BSC providers. An `eth_call` alone is not proof of a successful stateful buy/approve/sell sequence. Require supported stateful simulation or a verified alternative; block routes that cannot meet the safety requirement.
9. Inspect fee-on-transfer, post-transfer amount accounting, exact-output restrictions, liquidity changes, malicious callbacks, and quotes that expire before inclusion. Add MEV/slippage protection options only with verified provider support.

**Primary files:** `packages/trade/src/{types,pools,quote,build,universal-router,permit2,simulate,fast-send,quick,fees,fee-audit,curve-fee,policy}.ts`, web RPC proxy and trading hooks.

**Acceptance/tests:** BSC fork simulations cover native buy/sell, wrapped-native and supported ERC-20 quotes, approvals, fees/referrals, taxed tokens, revert paths, expiry, nonce concurrency, wrong-chain signatures, and unsupported RPC methods. Legacy 4663 fixtures remain unchanged.

### Step 7 — Choose and implement the BSC contract path

**Dependencies:** step 2 deployment research and step 6 routing design; required before enabling any custom-contract path.

1. Decide whether the launch can execute through verified third-party routers while preserving disclosed fees. If the venue cannot atomically support the fee mechanism, explicitly choose an audited wrapper or defer that execution path. Do not hide a fee semantic change behind routing refactoring.
2. If custom contracts are needed, create a versioned BSC deployment design. Review `RushrRouter.sol` against the selected router's real command/action encoding, callback surface, pool derivation, recipient handling, and token-tax behavior. Existing Solidity function names such as `WRAP_ETH` may be protocol constants; renaming strings does not adapt their semantics.
3. Parameterize wrapped-native, router, Permit2 where applicable, treasury, guardian, fee parameters, and allowlists. Check chain identity and nonzero contract code during deployment preflight; verify expected code hashes/implementations.
4. Keep `RushrPonsRouter` Robinhood-only unless the exact supported PONS interface is verified on BSC. A different BSC launchpad needs a separately validated curve adapter/router with its own graduation, refund, tax, and fee semantics.
5. Preserve old selectors, event meanings, and structs for any genuinely deployed legacy integration. If BSC needs incompatible semantics, introduce a new ABI/version and route clients by `(chainId, address, contractVersion)`. Do not reinterpret an existing `Kind.V4` as Pancake Infinity.
6. Do not assume upgradeability: the current drafts use constructor/immutable configuration, with a treasury timelock rather than a general proxy upgrade mechanism. Prefer separately deployed versioned contracts. If a proxy architecture is newly selected, treat storage layout, initialization, authorization, and upgrade governance as additional audited scope.
7. Validate compiler/EVM target against BSC fork execution, including any transient-storage-dependent third-party route. Test treasury timelock, pause/exit behavior, refund handling, reentrancy, allowance cleanup, malicious tokens, fee rounding, and preservation of pre-existing router balances.
8. Run Foundry unit/fuzz/invariant tests and mainnet-fork tests at pinned blocks. Reuse existing Robinhood tests as regression coverage and add BSC deployment fixtures. BSC testnet alone cannot establish compatibility with mainnet venues.
9. Obtain independent review before production use of custom contracts or delegated signers. Rehearse on testnet, verify source on the appropriate explorer, record deployment transactions/constructor arguments, and validate a BSC multisig treasury/guardian. Do not assume the Robinhood Safe exists at the same address on BSC.

**Primary files:** `contracts/src/{RushrRouter,RushrPonsRouter,TreasuryTimelock}.sol`, `contracts/test/`, `contracts/{foundry.toml,README.md,REVIEW.md}`, TypeScript contract ABIs and encoders.

**Acceptance:** deployed BSC source and bytecode match the reviewed build; recipients and fees match simulations; emergency exits are demonstrated. No “upgrade” transaction is planned for a contract that is not actually upgradeable.

### Step 8 — Update identity, wallets, delegated policies, and MCP

**Dependencies:** steps 2, 4, 6; step 7 if using custom routers.

1. Configure a fork-owned Privy app and its actual allowed domains/chains. Verify BSC support, network switching, embedded-wallet behavior, transaction types, and account export in the selected SDK version.
2. Decouple global member identity from trading-chain selection. An EOA may keep the same address, but contract accounts, balances, and wallet-provider policies require chain-specific verification.
3. Bind SIWE nonces/challenges to expected domain, URI, purpose, chain, address, and expiry. Maintain a legacy 4663 challenge/verifier during the compatibility window; add explicit BSC challenges. Never accept a message from another domain or chain by weakening validation.
4. Preserve existing member IDs, follows, and API keys where their authorization model remains valid. Do not expand an existing key or delegated signer to BSC spending automatically; require explicit chain scope/consent and apply global plus per-chain spend limits.
5. Keep old signing policies attached to old chain/router addresses. New BSC policies must allow only reviewed selectors/spenders, bound value/fees, and the intended chain. Test revoked/expired policies and chain replay rejection.
6. Add chain selection to agent API/MCP configuration and tool schemas. Keep old tool behavior pinned to Robinhood. Introduce native-unit configuration such as `RUSHR_GAS_RESERVE_NATIVE`; accept `RUSHR_GAS_RESERVE_ETH` only for legacy 4663 configuration, never reinterpret it as BNB silently.
7. Scope local spend ledgers, transaction state, and chain-specific API credentials by chain/account. Preserve a global USD cap if that was the user's existing safety limit. Migrate local state with a version and backup; do not generate or move private keys implicitly.
8. Update `packages/agents/llms.txt`, `skill.md`, examples, MCP documentation, and generated copies using the existing generators, so agent instructions target the independent backend and correct chain.

**Acceptance/tests:** old sign-in/client fixtures still work within policy; BSC registration/trading requires explicit scope; chain/domain replay tests fail; balances and caps remain correct after rapid network switches; dry-run mode never signs or sends.

### Step 9 — Refactor the web interface and browser state

**Dependencies:** steps 4–6 and 8.

1. Add an application chain context/selector and explicit chain labels on tokens, trades, balances, fees, histories, and explorers. The new product can default to BSC; read-only legacy links must retain explicit Robinhood context.
2. Introduce chain-qualified token URLs, for example `/chains/56/token/:address`. Keep old `/token/:address` URLs mapped to 4663 or a dedicated legacy host. Never infer the chain from a ticker or from the address existing on only one current search result.
3. Replace runtime ETH/WETH/USDG assumptions in native-price conversion, quick-buy amounts, gas reserves, settings, errors, wallet UI, PnL cards, and marketing copy. Keep historical ETH records labelled ETH.
4. Version local storage, session hints, persisted filters, cached token data, trade settings, quote stores, transports, and WebSocket subscriptions with chain/account. Preserve USD presets where intended; retain native ETH presets under 4663 and ask the user to choose BNB-denominated presets rather than copying numbers blindly.
5. Make RPC proxy routing chain-explicit with a server-controlled allowlist. Preserve body/method/rate limits, validate provider chain IDs, and avoid arbitrary upstream URLs supplied by clients. Update CSP/connect origins, metadata, canonical/share URLs, and CORS for owned services.
6. Keep deterministic SSR/hydration, the avatar SVG fix, and dependency compatibility tests. Render the same initial chain on server and client; apply a stored preference only through a deliberate URL/state transition.
7. Keep trading disabled in preview and show adapter capability limits. New BSC data must come from the independent BSC API, not a relabelled Robinhood feed.

**Acceptance/tests:** old bookmarks open the correct chain; BSC trades cannot use cached Robinhood quotes/allowances; settings migration is unit-safe; desktop/mobile routes and wallet changes work without hydration errors.

### Step 10 — Reconcile financial history and social semantics

**Dependencies:** steps 3–8.

1. Scope trade-ledger confirmation, trace/receipt auditing, platform fees, follow-up fee matching, referrals, creator-tax accounting, and treasury transparency to the chain of the original transaction.
2. Recompute BSC costs/PnL from BSC trades and their historical valuation. Keep legacy ETH-denominated costs and historical USD snapshots intact; never restate old ETH purchases using today's BNB price.
3. Preserve old callouts and their original token/chain, entry transaction, and PnL baseline. Label imported/unavailable data explicitly. Keep likes/comments/follows global where they reference global members/posts.
4. Define whether new leaderboards are BSC-only or cross-chain. Recommend a new BSC season with explicit rules; freeze old seasons. If cross-chain totals are offered, use consistent USD valuation, finality, time windows, and double-counting rules.
5. Separate BSC token issuance, liquidity migration, and any bridge from this software migration. An ERC-20 cannot be moved by changing its registry address. Any treasury/utility-token bridge or replacement requires its own reviewed tokenomics, custody, supply, claim, and reconciliation plan; no automatic user-fund movement is included here.

**Acceptance/tests:** per-chain and global totals reconcile; identical transaction hashes cannot claim fees across chains; reorg corrections update standings once; old positions and callouts retain their original values.

### Step 11 — Run the compatibility and migration rehearsal

**Dependencies:** steps 3–10.

1. Run lint/typecheck/unit tests, the wallet-dependency and avatar regression suites, and Foundry tests where contracts changed. Keep Linux CI for Unix permission assertions; separately exercise the Windows local workflow.
2. Add fixtures for legacy API/SDK/MCP contracts, versioned socket traffic, schema backfills, old storage settings, old SIWE challenges, and existing bookmarks. Test old-client/new-server and new-client/new-server combinations; unsupported new-client/old-server combinations must fail clearly.
3. Use pinned Robinhood and BSC mainnet fork blocks for protocol simulations, stateful sellability checks, approval/spender validation, taxes, fee accounting, and nonce/gas failure cases. Keep live-RPC tests separate from deterministic CI.
4. Exercise a chain-collision fixture set, malicious route substitution, wrong-chain RPC, stale quotes, stale price feeds, stablecoin depegs, dropped/replaced transactions, removed logs, provider outages, queue redelivery, and cross-chain replay.
5. Rehearse a production-sized database copy: expand, capture writes, backfill, reconcile at watermark, switch readers/writers, and roll back. Verify backup restoration, lock duration, and resource headroom.
6. Establish release thresholds before rollout: zero chain-identity/signing violations, exact canonical event/accounting reconciliation at the same watermark, no unexplained PnL drift, and measured budgets for indexing lag, quote latency, failure rate, RPC spend, and recovery time. Record numeric SLOs after a representative soak rather than inventing production guarantees.

**Acceptance:** evidence is attached to each gate; failing safety checks block trading, not merely generate warnings. No mainnet test trade is required during planning; future canary transactions use explicitly authorized test wallets and a fixed spending budget.

### Step 12 — Cut over in stages with reversible controls

**Dependencies:** all prior release gates; reviewed deployment manifest; independent production infrastructure.

1. Deploy chain-aware compatibility readers with BSC execution off. Confirm Robinhood behavior is unchanged.
2. Run the BSC indexer in shadow mode; reconcile external/on-chain samples and verify resource budgets. Keep per-chain health/metrics separate.
3. Release BSC browsing, then simulation-only quoting. Verify chain labels, stale-price behavior, discoverability, supported venues, and API isolation.
4. Enable BSC trading for a limited authorized cohort with conservative caps and explicit wallet/chain scope. Observe approvals, confirmed receipts, fee receipts, balances, and account isolation.
5. Expand only after the agreed soak/SLO gates pass. Switch the new UI default to 56, while retaining legacy routes/API mappings and versioned client releases.
6. Monitor per chain: cursor/head/finality lag, reorg depth, decode failures, queue age/retries, RPC errors/quota, quote/receipt latency, chain mismatch rejection, fee mismatch, nonce replacement, accounting drift, and treasury activity. Add pause controls by chain and adapter.
7. Publish supported feature/venue coverage, migration limitations, account instructions, and the legacy support schedule. Keep current preview/auth flags off until owned integrations are ready.

**Acceptance:** BSC is the new product default without changing old clients' execution chain or merging histories. Operators can disable one adapter or chain independently.

### Step 13 — Retire temporary compatibility mechanisms deliberately

**Dependencies:** completed compatibility window, reconciled historical data, no active old writers/consumers, and a successful rollback review.

1. Measure old API/tool/topic usage and announce deprecations before removal. If Robinhood trading is retired, keep history/explorer access and return explicit execution-disabled errors.
2. Remove old writers/outbox mirrors only after the single-writer handoff is proven. Retain archived data and restore procedures. Drop old schema objects only in a separate reviewed migration.
3. Keep historical contract ABIs, chain definitions, registry versions, and decoder fixtures needed to interpret old records. Remove obsolete runtime defaults and aliases without corrupting historical meaning.
4. Re-audit allowances, delegated policies, service secrets, deployment ownership, and expired operational access. No automatic asset sweep, approval revocation transaction, or bridge action is implied.

**Acceptance:** the supported BSC system has one authoritative write model, and old records remain explainable and retrievable under the published retention policy.

## 4. Rollback and failure boundaries

- **Before BSC execution:** disable BSC browsing/quotes or restore the previous application artifact; retain additive schema and new data. Never restore old unscoped writers against a schema they cannot safely use.
- **After BSC execution:** pause new BSC buys/delegated execution by adapter; keep safe user-confirmed exits and read access available where their execution path is valid. Drain/reconcile pending transactions and fee jobs on their original chain. A UI rollback cannot undo an on-chain transaction.
- **Data rollback:** switch to reconciled legacy readers for Robinhood, retaining the successor schema and BSC event history. Prefer forward repair to dropping chain columns or erasing successful trades. Restore a database backup only with explicit post-backup event replay/reconciliation.
- **Contract rollback:** route new quotes to an already verified older BSC deployment only if its capabilities match. Never switch a BSC transaction to a Robinhood address or silently change approval spenders. Proxy rollback is available only if an explicitly audited proxy design was adopted.
- **Auth rollback:** revoke only newly introduced BSC policies/scopes when needed; preserve valid legacy identity access. Do not broaden legacy signatures to recover availability.
- **Pause triggers:** wrong-chain signing/provider, unexplained accounting drift, failed sellability simulation, unsafe deployment mismatch, stale valuation beyond policy, or unrecoverable indexing/finality inconsistency. Define owners and response procedures before enabling trades.

## 5. Decisions to resolve before implementation

1. Confirm BSC 56 rather than opBNB, and choose the independent backend/deployment domains.
2. Choose launch venues and BSC launchpads; decide whether Infinity and full bonding/graduation parity are required at first launch.
3. Choose third-party router execution versus a newly audited custom wrapper, including platform/referral fee semantics.
4. Confirm availability/rights to historical data, supported legacy client lifetime, and whether Robinhood trading remains enabled.
5. Define global member identity, per-chain spending scopes, leaderboard/season rules, and any separate utility-token migration requirement.
6. Select RPC, simulation, tracing, price, and metadata providers after capability/cost tests; allocate audit, migration, and operational ownership.

These choices affect the work estimate. Produce estimates after deployment/provider research and the data inventory; do not promise feature parity based only on changing chain ID and addresses.

## 6. Authoritative implementation references

Checked during planning on 2026-11-17; revalidate deployment addresses and provider capabilities at implementation time. No BSC contract address in this plan is approved for production use.

- [BNB network and wallet configuration](https://docs.bnbchain.org/bnb-smart-chain/developers/wallet-configuration/).
- [BNB JSON-RPC endpoints and log-query restrictions](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/).
- [BNB finality API](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/bsc-api-list/).
- [PancakeSwap v3 deployment addresses](https://developer.pancakeswap.finance/contracts/v3/addresses).
- [PancakeSwap Universal Router deployments](https://developer.pancakeswap.finance/contracts/universal-router/addresses). Different router generations and deployments must be checked independently.
- [PancakeSwap Infinity architecture](https://developer.pancakeswap.finance/contracts/infinity/overview).

Repository evidence: `contracts/{README.md,REVIEW.md,foundry.toml}`, `docs/trading.md`, the chain registry, trading modules, database schema/migrations, indexer sources, SIWE module, and MCP configuration cited above. Production deployments, provider behavior, migrations, and BSC trading have not been executed or verified as part of this planning task.
