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

Run the frontend in a second terminal:

```powershell
pnpm run dev:web
```

If PowerShell blocks `pnpm.ps1`, use `pnpm.cmd` in the same commands.
