# @clashr/mcp — first local milestone

Clashr's BNB-mainnet MCP server runs on the operator's machine. It supports agent registration, finalized Flap index reads, safety, feed, rolling leaderboards, verified Flap/PancakeSwap v2/v3 quotes and real-balance simulation. **There is no transaction signing or broadcast implementation, and no buy/sell tool.** SIWE registration signs an identity proof and creates a real account; simulation never does.

This package is separate from `@clashr/legacy-mcp` and does not change it. It is licensed AGPL-3.0-only; see [LICENSE](LICENSE) and [NOTICE](NOTICE). This package is not yet published to npm, registered in a public directory, or installed into the user's clients.

## Build locally

From the repository root, using the project's Node >=22.23.4 and pnpm:

```powershell
pnpm --filter @clashr/mcp typecheck
pnpm --filter @clashr/mcp test
pnpm --filter @clashr/mcp build
```

The build inlines private workspace modules into `dist/index.js`; MCP SDK, viem and zod are normal runtime dependencies. The server writes MCP protocol messages to stdout and secret-free diagnostics to stderr.

## Configuration

- `CLASHR_API_URL`: owned BNB API **origin**, default `http://127.0.0.1:8790`. All responses must identify chain 56 using the `x-clashr-chain-id` header. The `/health` body must also report `{ok:true,chainId:56,product:"bnb"}`. There is no public API fallback, and legacy API origins are rejected.
- `CLASHR_PRODUCT_ORIGIN`: origin used in SIWE challenges. Defaults to `http://localhost:3000` only for loopback APIs; mandatory for a remote API. It must exactly match the BNB API's `PRODUCT_ORIGIN`.
- `CLASHR_RPC_URL`: BNB RPC. Falls back to the existing local `BSC_RPC_URL`, then the public BNB endpoint. Chain ID is checked before proofs, quotes and simulation. RPC credentials are never returned or logged.
- `CLASHR_STATE_DIR`: defaults to `~/.clashr`; never loads the legacy MCP state directory `~/.rushr`.
- `CLASHR_WALLET_FILE`: optional explicit Clashr keyfile path; otherwise `<stateDir>/agent-wallet.json`.
- `CLASHR_MAX_BUY_BNB`: positive native input limit, default `0.02`. No USD or daily execution budget is advertised because this milestone cannot execute trades.
- `CLASHR_SLIPPAGE_BPS`: 1..500, default 100.
- `CLASHR_DRY_RUN`: only `1` is accepted when provided. Changing an environment variable cannot enable live execution.

Use HTTPS for remote endpoints; plain HTTP is permitted only on loopback. Do not publish localhost as an API endpoint for other users. The localhost web proxy is not the MCP API root; use the dedicated API directly.

## Connect Codex or Claude Code

The installable plugin wrapper is now available locally: run `pnpm --filter @clashr/mcp build:plugin` and follow `plugins/clashr/README.md` in the source repository. It produces a self-contained marketplace/archive for both clients without an unpublished npm download. The direct MCP setup below remains an alternative; do not enable both entries at once.

Use absolute paths for `node`, the ignored environment file and built server. For example, register it in Codex from a shell where your configured RPC is already exported:

```powershell
codex mcp add clashr -- node "D:\Home\Utility_Projects\clashr\clashr-core\packages\clashr-mcp\dist\index.js"
```

Alternatively have Node load your ignored environment file:

```powershell
codex mcp add clashr -- node --env-file="D:\Home\Utility_Projects\clashr\clashr-core\apps\web\.env.local" "D:\Home\Utility_Projects\clashr\clashr-core\packages\clashr-mcp\dist\index.js"
```

Claude Code can register the same command with `claude mcp add clashr -- node ...`. Use `codex mcp list` or Claude's `/mcp` to inspect the connection, then start a new session. This is direct MCP setup. Do not install both a direct entry and the plugin entry under the same identity.

## Tools and operator flow

1. `my_status`: chain identity, BNB balance and member identity, or the no-wallet setup state.
2. `create_wallet`: creates a **new** dedicated wallet using exclusive file creation. Never overwrites a key and never returns one. It becomes usable immediately; no restart required.
3. `register`: choose a unique handle; optional display name/bio. The server verifies the exact SIWE chain, address, domain, URI, nonce, purpose, terms resource and time window **before signing**. It stores the scoped API key locally, bound to the API origin. `recoverKey:true` explicitly requests login/key rotation. Ordinary retries do not rotate.
4. `scan`, `token`, `feed`, `leaderboard`: BNB data only. Scan reports index cursor/staleness; almost-bonded matches the existing >=50% index threshold. Token safety remains unknown where not assessed. Default leaderboard is 30d because a season must first be configured.
5. `quote`: `{token,side,amountIn,venue}`. `venue` is `flap` or `pancake`. Raw input is BNB wei for buys or token base units for sells. An optional public `trader` permits quote previews without a private key; it cannot override a configured wallet. Flap native-to-quote conversion is supported where enabled. Flap sells can settle in an ERC20 quote asset: inspect `outputAsset` and exact decimals rather than assuming BNB.
6. `dry_run`: supply the `quoteId` returned by `quote` in the same server session. Quotes expire after the SDK's 60-second window. The shared SDK revalidates state/contracts and simulates exact approvals plus swap with actual balances and minimum outputs. It never invents balances. Insufficient funds, unsupported RPC simulation or stale/blocked quotes cause refusal. A simulation is not a fill or a leaderboard result.

Only the registration tool signs SIWE proofs. No wallet signing account or signer is supplied to the chain adapter; it has a public client only. Keys and API credentials remain in a local chain-56 file. API registration storage is atomically replaced. POSIX keyfiles require private permissions; on Windows protect the state directory with account-only NTFS permissions (POSIX mode bits do not establish Windows ACL isolation).

## Verification

```powershell
# Reads/quotes through the actual built server's stdio; never creates/registers a wallet.
node --env-file=apps/web/.env.local packages/clashr-mcp/scripts/smoke.mjs

# Optional token override (otherwise uses a current indexed Flap launch).
node --env-file=apps/web/.env.local packages/clashr-mcp/scripts/smoke.mjs 0xYourToken

# Optional real-balance simulation and a BNB/USDT PancakeSwap quote (still read-only).
node --env-file=apps/web/.env.local packages/clashr-mcp/scripts/smoke.mjs 0xYourToken --simulate --pancake
```

The smoke script uses an empty temporary state directory and a public trader address. It tests real quotes, not funded execution. Optional `--simulate` also runs a read-only real-balance simulation for that public address; it will fail if funds or provider simulation support are insufficient. Protocol tests exercise wallet setup, SIWE signatures, chain/domain rejection, caps, quote binding, simulation refusals, unknown safety and secret redaction. Run `pnpm --filter @clashr/indexer test test/clashr-mcp.test.ts` with `TEST_PG_ADMIN_URL` to exercise registration against the actual BNB product app and session restoration in a throwaway database; otherwise that integration test is skipped. It lives with the indexer tests to keep Cloudflare Worker types outside the Node MCP package. The existing trade SDK tests cover Flap and PancakeSwap build/simulation internals.

No production deployment, npm publication, mainnet account registration, funded transaction or client configuration change is part of this milestone. Reverting the added package and its lockfile importer removes it without changing legacy client behavior or product databases.

Header compatibility: existing clients and APIs may still use `x-rushr-chain-id: 56`. Clashr emits both names; updated clients accept either and reject conflicting chain IDs.
