# Clashr source and filename migration

This migration renames owned source and workspace packages while retaining existing runtime identities and user data. It does not deploy infrastructure, move funds, replace signing keys or migrate databases.

## Renamed source

- Workspace packages now use `@clashr/*`. The BNB server remains `@clashr/mcp`; the separate Robinhood server is `@clashr/legacy-mcp`. Imports, package dependencies, package filters, CI commands and the plugin checkout's lockfile use the new names together. These names do not imply new npm publications.
- `packages/trade/src/rushr-router.ts` is now `clashr-router.ts`, with `clashrLegacy*` exports for the retained Robinhood router adapter. The original module subpath and exported symbols remain explicit aliases to the same code.
- `packages/mcp/src/rushr.ts` is now `clashr.ts`, exporting `ClashrLegacyClient`. Its old class/result aliases remain available. This client still targets Robinhood and must not share the BNB client's credentials.
- Contract sources/tests use `ClashrLegacyRouter` and `ClashrLegacyPonsRouter` filenames and symbols. Their ABI functions and transaction encodings are unchanged; they remain unused legacy drafts. Current Flap trading still calls the external BNB Portal directly.
- The old plugin/skill folders are now `plugins/clashr-legacy` and `skills/clashr-legacy`; their generator and references use those paths. The active plugin is still `plugins/clashr`.
- Documentation CSS uses `clashr.css` and matching CSS variables/classes. Historical token reference pages live under `legacy-token`. The old static preview image filenames are now `og-clashr-legacy.jpg`. Redirects preserve the former public URLs.

## Compatibility deliberately retained

`apps/web/lib/brand-compat.ts` centralizes the old browser storage prefix, BNB session cookie and event names. Source code uses named helpers/constants, but saved settings, sessions, activity journals, open tabs and cross-tab channels continue to use their exact existing values. No data is discarded or copied into a new namespace.

The legacy trade SDK accepts both old and new router configuration names. Conflicting target/audit aliases are rejected. Existing Privy policy names, chain restrictions, targets, fee amounts and audit gates are retained. The old treasury export remains an alias explicitly identified as a historical Robinhood treasury, never a BNB treasury.

The legacy MCP prefers `CLASHR_ROBINHOOD_*` environment variables and accepts the former `RUSHR_*` variables as fallback. It keeps the existing legacy wallet directory and does not consume the BNB `CLASHR_PRIVATE_KEY` or `CLASHR_STATE_DIR`. The BNB MCP continues to reject the public legacy API and never loads the legacy wallet automatically.

Remaining Rushr text is intentional where it identifies upstream attribution/license sources, historical RUSHR token facts, original-chain SIWE proofs, published upstream dependencies, compatibility aliases, negative tests or existing deployment/database/queue/volume names. Replacing these strings blindly could change signatures, create empty data stores or redirect clients to a different chain. The retained legacy plugin's original public npm launcher is an external dependency, not a claim that the renamed local package has been published.

## Local workspace and validation

Existing dependency junctions for the old workspace scope are kept, and new `@clashr/*` junctions point to the same local packages. This lets old processes and new source resolve concurrently. A clean dependency installation uses the renamed package manifests. Existing user deletions, including the core `pnpm-lock.yaml`, are preserved; the core frozen-lockfile CI install therefore still requires a lockfile to be supplied before a fresh CI run.

Tests cover old SDK exports/subpaths, router config aliases and audit gates, identical policy output, legacy credential isolation, browser namespaces and event delivery. The complete package suites and builds are used to catch missed imports and generated-source drift. The legacy MCP's native-Windows Unix `0600` assertions remain a known validation limitation, not weakened security checks.

Backups of the pre-migration edited files are local under `.tools/clashr-name-refactor-backup` outside the repositories. Roll source/manifests/bundles back together if needed. No database or on-chain rollback is required.

## Verification on 2026-11-20

- No existing owned source paths in either repository contain `rushr`, and no source imports still use the `@rushr/*` scope. Ignored dependency stores and the local pre-migration backups are excluded from that audit.
- Core checkout: core 56 passed; trade 154 passed / 10 skipped; agents 21 passed / 3 skipped; web 86 passed; indexer 60 passed / 135 skipped; BNB MCP 25 passed. Legacy MCP: 126 passed with the two existing native-Windows Unix `0600` assertions still failing.
- Plugin checkout: trade 154 passed / 10 skipped; BNB MCP 25 passed. Both portable plugin builds succeeded, and the checked-in portable/Cursor bundles and hashes match the source build.
- TypeScript passed for core, agents, trade, database, indexer, web, both MCP packages and the plugin checkout's trade/MCP packages. New compatibility tests passed lint.
- The docs site built 31 pages, with every internal link valid. Flap interface tests passed 5 checks; its optional fork suite was explicitly skipped without an RPC. The compiled Flap ABI still matches the SDK.
- A temporary preview served `/`, `/trenches` and `/skill.md` with HTTP 200, and returned the expected permanent redirect for the old preview-image URL. Its explicit Turbopack monorepo root avoids package resolution failures when the checkout moves or its root lockfile is absent. The preview was stopped after verification.
- The normal local web/API ports were not listening. Database-backed/live integrations remain skipped where unconfigured; no funded transaction, external client installation, deployment or fresh core frozen-lockfile install was performed.
