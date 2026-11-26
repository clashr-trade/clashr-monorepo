# Vercel frontend and Windows VPS backend

Keep one repository. Deploy apps/web as a Next.js Vercel project; run the API and all six Flap workers plus PostgreSQL on the Windows VPS. The backend sync reads finalized index data directly and no longer needs Next.js running on port 3000.

## Vercel

Import this repository, choose Next.js, set Root Directory to apps/web and enable source files outside the Root Directory. apps/web/vercel.json defines the install and build commands. Use Node 22.x satisfying the root package.json minimum. Native Vercel deployments skip the Cloudflare dev adapter; existing Cloudflare workflows remain available.

Configure values from apps/web/.env.vercel.example in Vercel. PRODUCT_API_URL must be the reachable HTTPS API origin without a path. Never use localhost/127.0.0.1 for the remote backend. NEXT_PUBLIC_SITE_URL is the public frontend origin; leaving NEXT_PUBLIC_APP_URL blank keeps arena navigation on the current deployment. Keep BSC_RPC_URL server-only. Configure the existing Privy dashboard allowed origins if using Privy.

The browser continues to call /api/product on its own frontend origin. The Next.js proxy forwards to the VPS, holds wallet sessions in HttpOnly cookies and proxies uploaded avatars/banners. Do not replace it with a browser-direct backend URL or an external rewrite that bypasses session handling. No frontend database credentials are required. Keep existing frontend RPC/wallet settings; never copy backend database secrets into Vercel.

Use the production frontend origin as PRODUCT_ORIGIN on the VPS. Preview deployments can render pages, but wallet sign-in remains tied to that configured origin; do not share production authentication across arbitrary preview domains. Use a separate backend/environment for authenticated staging.

## Windows VPS

Existing apps/web/.env.local still works for local development and existing deployments. For the split deployment, copy .env.backend.example to .env.backend in the repository root and fill it from your existing private configuration. Preserve DATABASE_URL, BSC_INDEX_DATABASE_URL, BSC_RPC_URL, cursor start blocks, index epoch and stable secrets. Set PRODUCT_ORIGIN to the HTTPS frontend origin. Do not carry over DEV_ALLOWED_ORIGIN or CLASHR_HTTP_PREVIEW_ORIGIN. PRODUCT_MARKET_ORIGIN is no longer used by the Node product sync. A custom file is supported with --env-file=PATH.

The backend and demo seed launchers prefer .env.backend when present and otherwise fall back to apps/web/.env.local. Explicit process environment values override the selected file. Once adopted or initialized, the index database's persisted configuration takes precedence over start-block/epoch environment values. Database credentials, RPC URL and other runtime settings continue to come from the environment.

With PostgreSQL running, from the repository root:

~~~powershell
pnpm install --frozen-lockfile
npm run start:backend
~~~

For updated educational fixture data, run once in another terminal if needed:

~~~powershell
npm run seed:demo -- --refresh
~~~

Keep only one backend group running. No frontend build/start process is needed on the VPS. start:backend currently uses the existing tsx runner and requires the installed workspace dependencies, including development dependencies. For unattended uptime, configure a Windows service or Task Scheduler to start it after boot; foreground terminal execution ends when that process is stopped.

## Automatic index startup

Startup resolves history and live indexing together before launching any services. It automatically applies only the additive 0021_flap_startup_config metadata table, under the existing index advisory locks. The index database user needs permission to create that table; alternatively apply packages/db/migrations/0021_flap_startup_config.sql ahead of time as the database owner. The existing index/product schema must already be migrated; this does not initialize the rest of a blank database.

On a migrated database with no cursors, BSC_START_BLOCK, BSC_LIVE_START_BLOCK and BSC_INDEX_EPOCH are optional. Omitted starts default to the current finalized BNB mainnet block, sampled once for both workers. The default epoch is flap_v1 (live uses flap_v1_live). This indexes forward only: configure an explicit BSC_START_BLOCK before first startup if you need earlier launch history. Explicit starts are preserved; startup never silently chooses a later start to avoid backfill.

The complete identity (version, decoder, chain constants, scope, original start block and epoch) is persisted separately for each worker. Every restart reuses it and ingestion continues from its existing checkpoint. Stale environment values are reported and ignored after configuration has been persisted. Changing providers does not change the indexing identity. Decoder/chain changes still require a reviewed migration or replay.

Older hash-only cursors are adopted only if their identity can be reproduced exactly. Startup first tries the supplied start/epoch, then the saved start with the supplied epoch; neither attempt changes any cursor. Both modes must validate or the entire initialization rolls back. Preserve the original settings for this one-time adoption. A legacy mismatch cannot be repaired by making the current environment authoritative or overwriting its hash.

Rollback: stop the group and restore the prior code with its original resolved start/epoch settings. Keep the additive metadata table and cursors intact; no indexed rows are rewritten by this change.

## Index integrity startup errors

If a worker stops with an index integrity error, stop the backend group and run:

~~~powershell
npm run start:backend -- --check-index
~~~

This read-only diagnostic uses the same startup resolver, prints resolved settings, and checks saved finalized block hashes against the configured RPC. It never creates metadata or resets/advances cursors. For a new index it may sample a proposed finalized start; only normal startup persists it.

For a configuration mismatch, restore this database's original BSC_START_BLOCK, BSC_LIVE_START_BLOCK and BSC_INDEX_EPOCH from its prior deployment configuration. Local development values need not match the VPS. Changing RPC credentials alone does not change the configuration hash; start block, epoch and decoder/chain configuration do. A matching start block alone cannot recover a missing epoch from its hash. If original settings are unavailable or restored settings still mismatch, retain the diagnostic output and review the deployed decoder version before planning a replay. Do not replace config_hash, clear halt_reason or delete cursors to bypass the guard. A stored finalized block mismatch requires provider/history verification and a reviewed reconciliation.

## HTTPS API ingress

### Temporary access without a domain

For temporary testing, Cloudflare Quick Tunnels provide an HTTPS trycloudflare.com origin without registering a domain or signing in. Install Caddy and cloudflared on the VPS from their official Windows downloads. Keep the API running on 127.0.0.1:8790 with PRODUCT_ORIGIN=https://clashr-trade.vercel.app.

In a second terminal, from the repository root:

~~~powershell
caddy validate --config deploy/Caddyfile.tunnel.example --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Gateway configuration is invalid.' }
caddy run --config deploy/Caddyfile.tunnel.example --adapter caddyfile
~~~

In a third terminal, check the gateway and start the tunnel:

~~~powershell
Invoke-RestMethod http://127.0.0.1:8789/health
cloudflared tunnel --url http://127.0.0.1:8789
~~~

Copy the HTTPS trycloudflare.com origin printed by cloudflared. Check its /health path externally and confirm /admin/sync-market returns 404. Replace Vercel's Production PRODUCT_API_URL with that exact origin (no path), then redeploy. Leave the VPS PRODUCT_ORIGIN pointing at the Vercel frontend. No frontend code or browser CORS changes are needed. This outbound tunnel needs no new inbound firewall rules; do not expose PostgreSQL, the gateway, Caddy's admin API or port 8790 publicly. Do not add interactive email authentication to this tunnel, because Vercel's server-side proxy cannot complete that login.

Quick Tunnels have changing hostnames, no uptime guarantee, a 200 in-flight-request limit and no SSE support. Keep the backend, gateway and tunnel running. If the tunnel restarts, update PRODUCT_API_URL and redeploy again. Move to the stable domain ingress below when ready. An existing index integrity mismatch or RPC quota failure must still be resolved independently.

References: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ and https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/.

### Stable domain ingress

Point your API domain to the VPS and configure an HTTPS reverse proxy using deploy/Caddyfile.example (replace the hostname). With Caddy installed, copy it to deploy/Caddyfile, validate it, and run it:

~~~powershell
caddy validate --config deploy/Caddyfile --adapter caddyfile
caddy run --config deploy/Caddyfile --adapter caddyfile
~~~

The config exposes only public API routes and rejects /admin/*. Keep the API bound to 127.0.0.1:8790 and PostgreSQL private. Allow the reverse proxy inbound TCP 80/443 through Windows and provider firewalls for HTTPS/certificate issuance. Retain the existing RDP access rules. Persist .local-media (or PRODUCT_MEDIA_DIR) and back up both product and chain index databases.

## Validation and rollout

First verify http://127.0.0.1:8790/health on the VPS, then https://YOUR-API-DOMAIN/health externally. Verify the external /admin/sync-market path returns 404. Backend metadata sync should succeed without any frontend server on port 3000. Then deploy Vercel and verify /api/product/v1/auth/wallet/session, wallet sign-in, trenches, token details, trade quotes/simulation and profile media. Existing sessions may need a fresh sign-in after the domain changes.

Keep the prior frontend available until the Vercel checks pass. Roll back by restoring the previous deployment and its matching PRODUCT_ORIGIN, then restarting the backend. No schema migration is introduced by this deployment change.

BNB app links and profile media always stay on the current frontend origin. NEXT_PUBLIC_APP_URL is ignored for BNB navigation, so a stale custom-domain or VPS value cannot move arena/agent links away from Vercel. NEXT_PUBLIC_SITE_URL still controls canonical/share metadata; set it to your actual public site URL.
