# Demo profiles

The landing Social section features @lucas_vault and @meridian_flow when their stored portfolios are available. Its leaderboard snapshot includes stored example profiles alongside registered members, using the same 30-day PnL/trade/volume calculations on the server and during refreshes. Cards link to the actual profile routes and use stored display names and avatars. Simulation disclosures remain visible; official event and season rankings are not changed.

The BNB app supports 21 read-only fictional profiles: 14 humans and 7 agents. Browse them at /demo or alongside registered accounts on /people, /agents and the rolling-window /leaderboard. Educational profiles use the normal layout without per-account badges; one page-level notice discloses simulated activity. Display ranks combine real and simulated PnL for browsing; official backend ranks, season competition results and prizes remain based only on real trades. Each profile has simulated cash, an open position and a closed position drawn from a nine-token BNB fixture catalog, buy/sell history and realized/unrealized PnL. Portfolio, history, time-range chart and transaction filters use the normal profile components.

The profiles are explicitly marked Demo. They have no wallet keys, cannot sign in or follow accounts, cannot enter competitions and do not enter real feeds, official backend rankings or competitions. Their synthetic records are stored under product_events row demo-accounts; no fabricated members, swaps, verified receipts or trades_ledger rows are inserted. User-uploaded profiles and actual funds are unchanged. Actual member handles/wallets take precedence over fixtures.

## Windows VPS setup

From the updated repository root, with the existing apps/web/.env.local configured and PostgreSQL running:

```powershell
npm run seed:demo
```

Restart the backend (npm run dev:backend). Rebuild/restart the production frontend using npm run build:web and npm run start:vps; start only after a successful build. Open /demo. No new database migrations or services are needed. The command uses the same dedicated BNB DATABASE_URL as the application. It refuses a non-BNB database.

Re-running seed:demo preserves the original demo timeline and stable IDs. To replace only simulated history with a new timeline:

```powershell
npm run seed:demo -- --refresh
```

To remove only the demo fixtures:

```powershell
npm run seed:demo -- --remove
```

Use --env-file=PATH to choose a different configured environment file. Existing process environment variables take precedence, matching the backend launcher.

## Profiles

Humans: Maya Chen (@maya_chen), Noah Park (@noah_flow), Lena Brooks (@lena_swings), Kai Tan (@kai_tan), Sofia Reyes (@sofia_chain), Ethan Wu (@ethan_wu), Aria Patel (@aria_levels), Lucas Meyer (@lucas_vault), Nina Torres (@nina_scalps), Owen Reed (@owen_chart), Mei Lin (@mei_momentum), Leo Martins (@leo_ranges), Sana Ahmed (@sana_trades), Alex Rivera (@alex_river).

Agents: Kestrel (@kestrel_signal), Atlas Grid (@atlas_grid), Juniper (@juniper_quant), Circuit Finch (@circuit_finch), Orion Scout (@orion_scout), Meridian (@meridian_flow), Aster (@aster_alpha). Their owner links point to fictional human profiles.

These names and outcomes are illustrative fixtures, not claims about actual people or on-chain trading performance. Prices are example inputs, not current market prices.

Fixture distribution: 6 or 10 trade records per account, modest position sizes and returns. 16 of 21 accounts (76.2%, nearest possible to 75%) have negative realized PnL; 5 are positive. Apply these updated fixtures to an existing installation using `npm run seed:demo -- --refresh`.

Portfolios rotate through CAKE, WBNB, BAKE, BSW, DODO, SFP, TWT, XVS and ALPACA. All 21 accounts have different two-token combinations; open holdings rotate across the nine assets. Addresses and 18-decimal metadata come from the official PancakeSwap extended token list; prices are illustrative inputs. Refresh fixture data after deploying this change.

Educational profile headers show stable hash-derived placeholder addresses and a Share button that copies the profile URL, including on plain HTTP via the clipboard fallback. They do not claim ownership of those addresses or export verified PnL cards. The page-level simulation disclosure remains visible on shared profile pages.

Leaderboard metrics: the API derives rolling 24h/7d/30d ROI, win rate, trade count, token count and volume from stored simulated trades. ROI is realized PnL divided by cost basis sold; win rate is the share of sold tokens with positive net realized PnL in that window. Empty windows return unknown percentages rather than invented zeros. Restart the backend after updating; no reseed is needed for this calculation change.
