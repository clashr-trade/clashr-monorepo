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

## Access through the VPS IP during development

With your environment already configured, run this from the repository root:

```powershell
pnpm run env:vps
```

This sets the app and wallet-login origins to `http://135.181.237.187:3000` and
enables BNB product mode. It updates `apps/web/.env.local` and an existing root
`.env.vps`, preserving unrelated settings and secrets. Both files stay ignored
by Git; pulling the repository does not modify them automatically.

Restart `pnpm run dev:web` and `pnpm run dev:backend` (or the backend command
with your custom environment-file option). Open **http://135.181.237.187:3000**,
not HTTPS. Ensure the frontend is listening on all interfaces and that Windows
and provider firewalls permit TCP 3000. Keep the database and API ports private.

For a different origin, use `pnpm run env:vps --origin=https://your-domain.example`.
The HTTP preview exception does not apply to `start:web`; production public
access requires a valid HTTPS reverse proxy. Wallet providers that require a
secure browser context will still need HTTPS outside localhost.
