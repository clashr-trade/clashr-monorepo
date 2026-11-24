# Windows backend launcher

From the repository root, with Node >=22.23.4, installed dependencies, configured
environment and initialized PostgreSQL databases:

```powershell
pnpm run dev:backend
```

The default environment file is `apps/web/.env.local`. To use another file:

```powershell
pnpm run dev:backend --env-file=.env.vps
```

The command starts the BNB product API plus Flap live indexing, historical replay,
metadata, holders, safety and active discovery. Logs share the terminal with a
service prefix. Ctrl+C stops all seven processes. If one exits, the group stops
with a nonzero status; integrity failures are not automatically restarted.
Stop any manually started copies before using this launcher.

Check required configuration and runner dependencies without starting services:

```powershell
pnpm run dev:backend --check
```

This check does not connect to PostgreSQL or the RPC provider. PostgreSQL stays
independently managed as a Windows service. The launcher does not initialize or
migrate databases, start the frontend, install a Windows service, or configure
automatic startup. This remains the existing development runtime.

For VPS page performance, build the frontend once and run the optimized Node
server in a second terminal. Stop `dev:web` before switching to `start:web`:

```powershell
pnpm run build:web
pnpm run start:web
```

Rebuild after source changes or changes to `NEXT_PUBLIC_*` settings in
`apps/web/.env.local`. `start:web` uses port 3000; optionally pass
`--hostname 127.0.0.1` when serving through a reverse proxy. It uses server-only
environment settings for the RPC proxy without starting a Cloudflare dev proxy.
Set `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, and the backend's
`PRODUCT_ORIGIN` to the actual HTTPS origin when using a public domain. The
development-only `DEV_ALLOWED_ORIGIN` is ignored in production.

For source development with hot reload instead:

```powershell
pnpm run dev:web
```

If PowerShell blocks `pnpm.ps1`, use `pnpm.cmd` in the same commands.

## Build memory and recovery

Native `build:web` uses one compilation worker, Webpack's memory optimizations,
and one native Rayon thread by default. Set `RAYON_NUM_THREADS` explicitly only
if you want to override that default. These options trade build parallelism for
lower peak memory; they do not turn off production optimizations or type checks.

Tailwind scans only `app`, `components`, and `lib` sources. Generated
`.next-backup-*` folders are excluded from Git, TypeScript and linting too. Keep
manual build backups outside the checkout, rather than inside an application
source directory. Stop `dev:web` and `start:web` before rebuilding: they share
the `.next` output directory.

A native `memory allocation ... failed` error aborts the build. Missing route
manifests after that failure are a consequence, not a second database problem.
Do not validate or start an unfinished build. Run the build and start as one
PowerShell script block so failure cannot fall through to the start command:

```powershell
& {
    pnpm run build:web
    if ($LASTEXITCODE -ne 0) { throw 'Build failed; frontend was not started.' }
    pnpm run start:web --hostname 127.0.0.1 --port 3000
}
```

On a small VPS, pause other memory-heavy jobs during the build. Check available
RAM and Windows page-file configuration before increasing any Node heap limit;
a Rust allocation failure is not controlled solely by V8's heap limit.

## Optimized access through the VPS IP

With your environment already configured, run this from the repository root:

```powershell
pnpm run env:vps
```

This sets the app and wallet-login origins to `http://135.181.237.187:3000` and
enables BNB product mode. It updates `apps/web/.env.local` and an existing root
`.env.vps`, preserving unrelated settings and secrets. Both files stay ignored
by Git; pulling the repository does not modify them automatically.

It also explicitly sets `CLASHR_HTTP_PREVIEW_ORIGIN` for this exact IP and port.
This allows an optimized Node build to serve HTTP for that origin without
redirecting it to HTTPS or dropping its port. Other public hosts still require
HTTPS. Build and run the frontend with:

```powershell
npm run build:web
# Only after a successful build:
npm run start:vps
```

`start:vps` binds the frontend to `0.0.0.0:3000`. Restart `npm run dev:backend`
(or the backend command with your custom environment-file option) in another
terminal. Open **http://135.181.237.187:3000**, not HTTPS. A bare IP without
`:3000` uses a different port and needs a separate proxy. Windows and provider
firewalls must permit inbound TCP 3000. Keep database and API ports private.

For a different origin, use `pnpm run env:vps --origin=https://your-domain.example`.
Using an HTTPS origin clears the HTTP preview flag; normal production hosting
should use a valid HTTPS reverse proxy. HTTP preview traffic is unencrypted.
Wallet providers requiring a secure browser context still need HTTPS outside
localhost. It does not bypass wallet confirmations or BNB execution validation.

## Diagnose RPC access and metadata sync

```powershell
npm run check:backend
# Or, if the backend uses the root environment file:
npm run check:backend -- --env-file=.env.vps
```

This performs read-only chain, finalized-header, historical-header and one-block
Flap log probes. It identifies blocked methods and safe provider error categories
without printing API keys or changing database cursors. HTTP 401/403 failures
back off for at least 60 seconds; rate limits also back off. No alternative
provider or unverified data is substituted.

Alchemy quota/capacity exhaustion must be resolved in the provider account.
Verify that BNB mainnet is enabled, the key has log and historical-read access,
and any IP allowlist permits the VPS. Do not paste credentials in logs or chat.

The Node backend uses `PRODUCT_MARKET_ORIGIN=http://127.0.0.1:3000` for metadata
sync, separately from the public `PRODUCT_ORIGIN` used by wallet login. Override
the internal origin if the frontend listens on a different local port. If sync
still returns 503, verify both `/health` on port 8790 and `/api/bsc/market` on
port 3000; an unready index or provider failure can also make the feed unavailable.
