# Clashr email and wallet sign-in

The original Privy flow supports email OTP sign-up, MetaMask and other EVM wallets. All Privy users receive an embedded Ethereum wallet used for their BNB member account and trading. Signing in with MetaMask proves identity; it does not move funds from MetaMask into that embedded wallet. The independent wallet-only SIWE flow remains the fallback when no BNB Privy app is configured.

## Local configuration

1. Create/use a Clashr-owned app in the [Privy dashboard](https://dashboard.privy.io). Enable email and Ethereum wallet login, automatic embedded Ethereum wallet creation, and allow `http://localhost:3000`. Set the dashboard app name to `Clashr` and its logo to the Clashr mark. The SDK also explicitly sets the modal heading, logo, gold accent and MetaMask option.
2. Set `NEXT_PUBLIC_BSC_PRIVY_APP_ID` in `apps/web/.env.local`. This is a public app identifier, not a secret. BNB builds deliberately never borrow `NEXT_PUBLIC_PRIVY_APP_ID` from the legacy app.
3. Set the **same** app ID as `PRIVY_APP_ID`, and its server-only `PRIVY_APP_SECRET`, in the BNB API process environment. Local `product-dev.ts` reads `process.env`; an arbitrary `.env` file is not automatically loaded. Use Node's `--env-file=<your ignored local env file>` when starting that process, or export the variables in the launching shell. Never prefix the secret with `NEXT_PUBLIC_`, commit it or send it to the browser.
4. Restart Next and the local BNB API after changing environment variables. Next public variables are read at build/start; API credentials are read by its process. Keep `PRODUCT_API_URL` pointed to the independent local BNB API and its dedicated chain-56 product database.

## Acceptance checks after configuration

- Open a fresh private browser session, enter the terminal and click Sign in. Confirm `Sign in to Clashr`, the gold Clashr mark, an email field and MetaMask/wallet options.
- Use your own email, complete the real OTP, choose a handle and finish onboarding. Reload to verify the member session restores. No fake OTP or client-only account is accepted by the backend.
- In a separate session, sign in using MetaMask's authentication proof, complete onboarding, and verify the member owns its embedded BNB trading wallet. No transaction or token approval is required for sign-in.
- Sign out and verify the member disappears. Check a browser that previously used wallet-only SIWE: a stale cookie must not override the new email/Privy member, or revive after logout.
- Verify email delivery, localhost allowlisting and matching server credentials with the owned Privy app. These live provider checks require configured credentials and an actual user's OTP/wallet confirmation; unit tests do not establish delivery or a completed real login.

## Compatibility and rollback

No member migrations or identity merges are performed. Existing wallet-only accounts retain their original addresses and records. Privy identities use their own embedded wallet; duplicate handles/wallets remain rejected by the backend. To return to wallet-only sign-in, remove the BNB public app ID and restart/rebuild the web app. Do not alter the dedicated product database or point BNB at the public Robinhood API.

## Verification

Web regression tests cover email/wallet configuration, BNB-only chain selection, Clashr branding, legacy-chain compatibility and explicit Privy identity precedence over old wallet cookies. The API's existing member and BNB product suites exercise signed-token validation, sign-up and wallet proofs against throwaway test databases.
