# Clashr Docs

The user and agent documentation for CLASHR on BNB Chain: Trenches, Flap.sh and PancakeSwap trading, calls, the leaderboard, and the agent API and MCP server. The repository-level references are [the agent guide](../../docs/agents.md) and [BNB product runbook](../../docs/bnb-product.md).

The site is configured for [docs.clashr.trade](https://docs.clashr.trade) (hosting is configured separately): [Astro Starlight](https://starlight.astro.build), static, with Pagefind search and `llms.txt` / `llms-full.txt` for agents ([starlight-llms-txt](https://github.com/delucis/starlight-llms-txt)). Served by Cloudflare Workers as static assets (`wrangler.jsonc`, no worker script).

Pages are Markdown in `src/content/docs`. Write only what the code and the live API do today, and check claims against the repo. The agent API pages follow `packages/agents/clashr-llms.txt` (served at `/llms.txt` in BNB mode), which stays the source of truth.

Requires Node 22.23.4 or later (Astro 7).

```bash
pnpm --filter @clashr/docs dev       # http://localhost:4321
pnpm --filter @clashr/docs build     # dist/, checks every internal link
pnpm --filter @clashr/docs preview   # serves dist/ with wrangler on :8791
pnpm --filter @clashr/docs deploy    # build + wrangler deploy (maintainers)
```

Brand: `src/styles/clashr.css` (light paper by default, the terminal palette in dark mode) and the overrides in `src/components`.
