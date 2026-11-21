# Clashr package names and compatibility identifiers

Owned source and workspace packages use Clashr names, while existing runtime identities and user data are retained. Renaming does not deploy infrastructure, move funds, replace signing keys or migrate databases.

## Package and source names

- Workspace packages use `@clashr/*`. The BNB MCP server is `@clashr/mcp`; the separate legacy server is `@clashr/legacy-mcp`. Imports, package dependencies, package filters, CI commands and the plugin checkout's lockfile use these names together. They do not imply npm publications.
- `packages/trade/src/clashr-router.ts` exports `clashrLegacy*` helpers for the retained legacy router adapter. The former module subpath and exported symbols remain explicit aliases to the same code.
- `packages/mcp/src/clashr.ts` exports `ClashrLegacyClient`, with its former class/result aliases. This client targets the legacy deployment and must not share the BNB client's credentials.
- Contract sources/tests use `ClashrLegacyRouter` and `ClashrLegacyPonsRouter` filenames and symbols. They remain unused legacy drafts. Current Flap trading calls the external BNB Portal directly.
- The active plugin is `plugins/clashr`. The legacy plugin and skill folders have been removed.
- Documentation CSS uses `clashr.css` and matching CSS variables/classes. Redirects preserve former public URLs.

## Compatibility deliberately retained

`apps/web/lib/brand-compat.ts` centralizes the retained browser storage prefix, the `rushr_bnb_session` session cookie and event names. Source code uses named helpers/constants, but saved settings, sessions, activity journals, open tabs and cross-tab channels continue to use their exact existing values. No data is discarded or copied into a new namespace.

The legacy trade SDK accepts both old and new router configuration names. Conflicting target/audit aliases are rejected. Existing Privy policy names, chain restrictions, targets, fee amounts and audit gates are retained. Its treasury export is a legacy alias, never a BNB treasury.

The legacy MCP reads `CLASHR_ROBINHOOD_*` environment variables and accepts `RUSHR_*` variables as fallback. It keeps its own wallet directory and does not consume the BNB `CLASHR_PRIVATE_KEY` or `CLASHR_STATE_DIR`. The BNB MCP rejects the legacy public API and never loads the legacy wallet automatically.

Retained compatibility strings include upstream attribution/license sources, signed-proof formats, published upstream dependencies, compatibility aliases, negative tests and existing deployment/database/queue/volume names. Replacing them blindly could change signatures, create empty data stores or redirect clients to a different chain.

## Local workspace and validation

Existing dependency junctions for the former workspace scope are kept alongside the `@clashr/*` junctions, which point to the same local packages, so old processes and new source resolve concurrently. A clean dependency installation uses the current package manifests.

Tests cover former SDK exports/subpaths, router config aliases and audit gates, identical policy output, legacy credential isolation, browser namespaces and event delivery. The complete package suites and builds catch missed imports and generated-source drift. The legacy MCP's native-Windows Unix `0600` assertions remain a known validation limitation, not weakened security checks.
