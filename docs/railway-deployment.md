# Railway frontend, backend and fresh PostgreSQL

This deployment uses a fresh Railway database. It does not copy, reset or modify the VPS database. No Railway session cookie or token belongs in the repository or service variables.

## Services and source

Create one Railway project/environment with services named `frontend`, `backend` and `Postgres`. Connect both application services to this GitHub repository, branch `main`. Keep both Root Directories at `/` so the pnpm workspace, packages, patches and documentation are available. Use Railpack, not Docker.

Configure commands in each service's Railway settings. Frontend: build `npm run build:web`, start `npm run start:railway:web`, health check `/api/health`. Backend: build `node --check scripts/dev-backend.mjs`, pre-deploy `npm run migrate:railway`, start `npm run start:railway:backend`, health check `/health`. Use a 300-second health-check timeout. The TOML files in `deploy/railway` are reference configurations for older Railway installations; the current API rejects Config File Path because Config as Code is deprecated. Leave that setting empty and use the native settings above.

Add variables from `deploy/railway/frontend.env.example` and `deploy/railway/backend.env.example` in the appropriate service's Variables editor. These files are templates, not automatically loaded secrets. Retain Node 22.23.5, pnpm from packageManager, `RAILPACK_NODE_INSTALL_PATTERNS=patches/**` (needed for the ox dependency patch during install), and `RAILPACK_PRUNE_DEPS=false` (the existing scripts require tsx).

## Networking and origins

Generate a Railway-provided public domain for the frontend, targeting port 3000. No purchased domain is needed. Use that exact HTTPS origin for both frontend `NEXT_PUBLIC_SITE_URL` and backend `PRODUCT_ORIGIN`, e.g. `https://frontend-example.up.railway.app`. Configure public wallet-provider allowed origins for this URL if using Privy.

The backend has `PORT=8790` and `PRODUCT_API_HOST=::`, supporting IPv4/IPv6. Leave the backend and Postgres without public domains/TCP proxies. Set frontend `PRODUCT_API_URL=http://backend.railway.internal:8790`. Both services must be in the same Railway project and environment. Only the frontend's server uses this address; the browser keeps calling `/api/product` on its own HTTPS origin. Existing cookie/session handling and media URLs remain same-origin. Railway encrypts private inter-service traffic; no Caddy or Cloudflare tunnel is involved.

Generate the frontend domain and set origins before deploying, then deploy the backend before the frontend. Private hostnames are available at runtime and in pre-deploy jobs, not during builds. The frontend build tolerates unavailable backend data; it renders current data once running.

## Database, workers and uploads

Create the fresh `Postgres` service first. Set both backend `DATABASE_URL` and `BSC_INDEX_DATABASE_URL` to the Railway reference `${{Postgres.DATABASE_URL}}` using the private connection URL. One dedicated chain-56 database can hold product and index schemas. Never put database credentials in the frontend.

The backend pre-deploy command is `npm run migrate:railway`. It initializes the base/index and BNB product SQL migrations under an advisory lock, with checksums and an applied-migration ledger. Subsequent deploys apply only missing migrations. It refuses untracked non-empty databases and never invents a baseline or drops existing data. If migration fails, deployment stops. Migrations do not require an RPC connection or a mounted volume.

Normal start is `npm run start:railway:backend`: API, live/history ingestion, metadata, holders, safety and discovery run under the existing supervisor. Railway variables replace local .env files. A failed worker still stops the group so Railway can restart it. Keep **one backend replica** with sleeping/serverless disabled: these are continuous workers. Attach a backend persistent volume mounted at `/data`, with `PRODUCT_MEDIA_DIR=/data/media`, to retain avatars and banners. Do not horizontally scale this filesystem-backed worker group; the volume-backed service also avoids overlapping writers during deploys.

Provide a BNB RPC endpoint with sufficient quota, finalized/history and eth_getLogs access. New index starts default to the current finalized block and persist their identities. This indexes forward only: set `BSC_START_BLOCK` to the earliest required launch block before first startup if historical data is needed. Do not copy the VPS's mismatched epoch or cursors into the fresh database. Initial safety data remains unknown until coverage is indexed.

Set stable, distinct `IP_SALT` and `ADMIN_TOKEN` secrets. Generate each once, e.g. `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Never regenerate on each startup. Railway's API transport exposes only public paths and rejects `/admin/*`; maintenance jobs call the application internally with their token.

Demo profiles are optional and are not seeded during deployment. To add the existing educational fixtures, run `npm run seed:demo` inside a running backend container with its managed variables. Existing fixture labeling and verified trading/accounting behavior are unchanged.

## Validation

For production live-feed recovery, set backend `BSC_LIVE_CATCHUP_BLOCKS=2000`. On startup, if the live worker is further behind than this threshold, startup verifies both saved checkpoint hashes and records an audited live handoff to the current finalized block. The history cursor and all indexed events are retained; the history worker fills the entire prefix before the new live start. A missing covering history cursor, integrity halt or ancestry mismatch blocks the handoff. Without this variable, saved live configuration is resumed unchanged. This keeps current launches visible while background history catches up after an outage.

Trenches displays an explicit stale-feed notice when the selected index is behind. Token ages come only from verified creation block timestamps. Older Flap launches can recover their creation and first-minute events from finalized Portal logs; provider transfer history supplies only the candidate mint height. Holder checkpoints are updated incrementally and stale snapshots can be reverified against current total supply. Missing launch or funding coverage remains unknown rather than becoming a zero-risk result.

Frontend health: `https://YOUR-FRONTEND.up.railway.app/api/health`. Backend health inside the project: `http://backend.railway.internal:8790/health`. Frontend health intentionally does not query the backend and is not proof of database readiness.

Verify `/trenches`, `/agents`, `/leaderboard`, `/api/product/v1/auth/wallet/session`, wallet sign-in, a token page and a profile image upload. Check the backend logs for all seven services. After a backend redeploy, verify a profile upload still exists and history/live ingestion resumes from saved cursors. Check `/admin/sync-market` on the backend transport returns 404, even with a token.

Keep the old VPS and Vercel deployments available until this verification is complete; do not delete their data. A code rollback must retain the Railway database and volume. Applied migration files must remain byte-equivalent (line endings are normalized) or the migration checksum guard will stop deployment. Use a reviewed forward migration rather than deleting migration history.

## References

- https://docs.railway.com/deployments/monorepo
- https://docs.railway.com/networking/private-networking
- https://docs.railway.com/deployments/pre-deploy-command
- https://docs.railway.com/config-as-code/reference
- https://railpack.com/languages/node/
