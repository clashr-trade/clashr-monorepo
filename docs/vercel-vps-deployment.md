# Vercel frontend and Windows VPS backend

Keep one repository. Deploy apps/web as a Next.js Vercel project; run the API and all six Flap workers plus PostgreSQL on the Windows VPS. The backend sync reads finalized index data directly and no longer needs Next.js running on port 3000.

## Vercel

Import this repository, choose Next.js, set Root Directory to apps/web and enable source files outside the Root Directory. apps/web/vercel.json defines the install and build commands. Use Node 22.x satisfying the root package.json minimum. Native Vercel deployments skip the Cloudflare dev adapter; existing Cloudflare workflows remain available.

Configure values from apps/web/.env.vercel.example in Vercel. PRODUCT_API_URL must be the reachable HTTPS API origin without a path. Never use localhost/127.0.0.1 for the remote backend. NEXT_PUBLIC_SITE_URL is the public frontend origin; leaving NEXT_PUBLIC_APP_URL blank keeps arena navigation on the current deployment. Keep BSC_RPC_URL server-only. Configure the existing Privy dashboard allowed origins if using Privy.

The browser continues to call /api/product on its own frontend origin. The Next.js proxy forwards to the VPS, holds wallet sessions in HttpOnly cookies and proxies uploaded avatars/banners. Do not replace it with a browser-direct backend URL or an external rewrite that bypasses session handling. No frontend database credentials are required. Keep existing frontend RPC/wallet settings; never copy backend database secrets into Vercel.

Use the production frontend origin as PRODUCT_ORIGIN on the VPS. Preview deployments can render pages, but wallet sign-in remains tied to that configured origin; do not share production authentication across arbitrary preview domains. Use a separate backend/environment for authenticated staging.

## Windows VPS

Existing apps/web/.env.local still works for local development and existing deployments. For the split deployment, copy .env.backend.example to .env.backend in the repository root and fill it from your existing private configuration. Preserve DATABASE_URL, BSC_INDEX_DATABASE_URL, BSC_RPC_URL, cursor start blocks, index epoch and stable secrets. Set PRODUCT_ORIGIN to the HTTPS frontend origin. Do not carry over DEV_ALLOWED_ORIGIN or CLASHR_HTTP_PREVIEW_ORIGIN. PRODUCT_MARKET_ORIGIN is no longer used by the Node product sync. A custom file is supported with --env-file=PATH.

The backend and demo seed launchers prefer .env.backend when present and otherwise fall back to apps/web/.env.local. Explicit process environment values override the selected file. Do not leave unrelated VPS environment variables overriding this deployment configuration.

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

## HTTPS API ingress

Point your API domain to the VPS and configure an HTTPS reverse proxy using deploy/Caddyfile.example (replace the hostname). With Caddy installed, copy it to deploy/Caddyfile, validate it, and run it:

~~~powershell
caddy validate --config deploy/Caddyfile --adapter caddyfile
caddy run --config deploy/Caddyfile --adapter caddyfile
~~~

The config exposes only public API routes and rejects /admin/*. Keep the API bound to 127.0.0.1:8790 and PostgreSQL private. Allow the reverse proxy inbound TCP 80/443 through Windows and provider firewalls for HTTPS/certificate issuance. Retain the existing RDP access rules. Persist .local-media (or PRODUCT_MEDIA_DIR) and back up both product and chain index databases.

## Validation and rollout

First verify http://127.0.0.1:8790/health on the VPS, then https://YOUR-API-DOMAIN/health externally. Verify the external /admin/sync-market path returns 404. Backend metadata sync should succeed without any frontend server on port 3000. Then deploy Vercel and verify /api/product/v1/auth/wallet/session, wallet sign-in, trenches, token details, trade quotes/simulation and profile media. Existing sessions may need a fresh sign-in after the domain changes.

Keep the prior frontend available until the Vercel checks pass. Roll back by restoring the previous deployment and its matching PRODUCT_ORIGIN, then restarting the backend. No schema migration is introduced by this deployment change.
