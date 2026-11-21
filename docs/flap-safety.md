# BNB Flap safety enrichment

This applies Clashr's indexed snapshot and deterministic signal calculations (`packages/core/src/signals`) to chain 56. Balances, infrastructure addresses, risk verdicts and funding records all come from BSC data; nothing is imported from another chain.

## Inputs and coverage

- Finalized Flap launch/trade events and ERC20 balances from the local BSC index. Balances are obtained either through contiguous transfer scans or through the chain-verified snapshot path below.
- On-chain total supply, creator identity and canonical holder checkpoint hash.
- Contract bytecode at that checkpoint, cached for five minutes. Only empty code and exact EIP-7702 delegation designators count as EOAs.
- Protocol Portal, token itself, selected migration pool, burns and other contracts are excluded from concentration. Burn balances reduce the circulating-supply denominator. The raw holder distribution still includes protocol reserves.
- Snipers use the shared five-second rule. Metrics require a contiguous index cursor spanning creation through the holder checkpoint; incomplete launch history stays unknown. The three-block bundle window remains a heuristic, not evidence of coordination.
- First-funding enrichment probes `alchemy_getAssetTransfers` on the configured, chain-verified BSC provider with a fixed upper block. Unsupported responses have a one-hour worker cooldown; failures or empty history are unknown. Insiders, fresh wallets and funding-linked bundles require complete relevant funding coverage. Common funders seen across 50 cached wallets are excluded from clustering.

No overall risk verdict, source-verification/renunciation status or honeypot pass is inferred. A successful historical sell does not prove a future sell will succeed. These fields remain unknown pending independent adapters and simulation work.

## Local operation

Apply migrations `0019_flap_safety.sql` and `0020_flap_safety_queue.sql` to **BSC_INDEX_DATABASE_URL only**, before starting the updated product API. Do not apply the full index journal to the separate product database.

Run `apps/indexer/scripts/flap-safety.ts --follow` with the existing BSC RPC and index database environment. Keep `flap-holders.ts --follow` running. Feed reads automatically enrol every returned token, with throttled queue writes. Opening a detail page raises priority; failed/unavailable histories have retry cooldowns so they cannot starve the rest of the feed.

Safety runs separately from launch ingestion and HTTP requests, processes up to eight eligible tokens per cycle, and caps each pass at 20 code reads and 20 optional funding requests. API reads use snapshots younger than five minutes; the UI shows checkpoint and computation time. Coverage labels distinguish checking, partial, retrying and unavailable history from measured data; none means a token is safe.

## Fast holder discovery with an on-chain completeness proof

For sparse tokens, `alchemy_getAssetTransfers` discovers candidate addresses through an explicitly finalized block number. Provider amounts are ignored. The worker reads `balanceOf` for every candidate and `totalSupply` at that same block, verifies the canonical checkpoint, and only publishes when the balances exactly sum to total supply. Omitted positive holders therefore prevent publication, even if the provider returned an incomplete or paginated history. The operation replaces balances atomically using a checkpoint compare-and-swap.

Discovery is bounded to two pages and 100 candidate addresses. If the optional API is unsupported or the proof fails, known launches fall back to contiguous log scans. The fallback shares an address filter across up to 12 overlapping watches, excludes each watch's already-applied prefix, paces ten-block requests for the free provider limit, and preserves checkpoints on failure. Unknown launch dates may still obtain proven current holdings, but launch/sniper classifications remain unknown without creation coverage. Large histories deliberately remain incomplete when budgets are exceeded.

## Validation and rollback

Regression tests cover circulating supply, masked unknown fields, EIP-7702, unsupported funding APIs, protocol reserve exclusions, canonical checkpoints, launch coverage and expired cache entries. No funded transactions are needed.

To disable enrichment, stop the safety worker. Cached fields expire within five minutes while feeds/trading continue. Leave the additive cache tables in place; reverting the consumer code does not require deleting indexed events or balances. Production deployment and worker scheduling are separate from this local setup.
