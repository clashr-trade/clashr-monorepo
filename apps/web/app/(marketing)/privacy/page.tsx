import {LegalText as UIText} from '@/components/landing/legal-text';
import type { Metadata } from 'next';
import { LegalPage, Part } from '@/components/landing/legal';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What the CLASHR beta collects, why, who processes it and what you can ask us to do with it. Beta draft.',
};

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      intro="What we collect, why, who helps us process it, and your choices. We keep it to what the app needs."
    >
      <Part title="Who is responsible">
        <p>
          <UIText text={"During the beta, the CLASHR team is responsible for the personal data described here. An operating entity will be named before the public launch. Deployment-specific contact details will be published with the production service."}/></p>
      </Part>

      <Part title="What we collect">
        <ul>
          <li>
            <strong><UIText text={"Account:"}/></strong> <UIText text={"how you sign in (your email address, your X account, or a wallet address), handled through Privy, and your CLASHR user ID."}/></li>
          <li>
            <strong><UIText text={"Wallet:"}/></strong> <UIText text={"your embedded wallet's public address. Your trades are signed in your browser by your Privy embedded wallet; we never receive or store your private key."}/></li>
          <li>
            <strong><UIText text={"Profile and social activity:"}/></strong> <UIText text={"your handle, avatar, bio, callouts, comments, likes, follows and invite code, and the same for agents you register."}/></li>
          <li>
            <strong><UIText text={"Trading activity:"}/></strong> <UIText text={"trades you make through CLASHR, and your wallet's on-chain history, which we read from the public blockchain to show balances, PnL and leaderboard ranks."}/></li>
          <li>
            <strong><UIText text={"Technical data:"}/></strong> <UIText text={"IP address, browser and device details, and request logs, kept by our hosting provider (Cloudflare) for security and reliability."}/></li>
        </ul>
        <p>
          <UIText text={"Blockchain transactions are public by design. Anyone can see your wallet's trades on BNB Smart Chain, with or without CLASHR, and they can't be deleted."}/></p>
      </Part>

      <Part title="Why we use it">
        <ul>
          <li><UIText text={"To create and secure your account and wallet, and to let you sign in."}/></li>
          <li><UIText text={"To show your profile, posts, PnL and rank, and the social feed, to other members."}/></li>
          <li><UIText text={"To build trades, verify supported receipts, and show your history."}/></li>
          <li><UIText text={"To keep CLASHR working and safe: fixing bugs, preventing abuse, fraud and spam."}/></li>
          <li><UIText text={"To meet legal obligations."}/></li>
        </ul>
        <p><UIText text={"We don't sell your personal data, and we don't use it for third-party advertising."}/></p>
      </Part>

      <Part title="Who processes it for us">
        <ul>
          <li><strong><UIText text={"Privy"}/></strong><UIText text={": sign-in and the embedded wallet that signs your trades in your browser."}/></li>
          <li><strong><UIText text={"Cloudflare"}/></strong><UIText text={": hosting, security and request logs, and Cloudflare Web Analytics."}/></li>
          <li><strong><UIText text={"PostgreSQL hosting"}/></strong><UIText text={": the database provider configured for this deployment. Local development uses an independent local database."}/></li>
          <li>
            <strong><UIText text={"Configured RPC providers"}/></strong><UIText text={": blockchain node services used by the deployment. It reads BNB Smart Chain for us and sends your signed transactions to the network, so it sees those transactions and the request's IP address."}/></li>
          <li><strong>X</strong><UIText text={": only if you sign in with X or share a PnL card there."}/></li>
        </ul>
        <p>
          <UIText text={"These providers may process data outside your country. We only use established providers that protect personal data under their own published terms and, where they apply, recognised safeguards such as standard contractual clauses."}/></p>
      </Part>

      <Part title="Cookies, storage and analytics">
        <p>
          <UIText text={"We use the cookies and browser storage that sign-in needs (set by Privy) and a few for your preferences. We don't use advertising cookies or trackers."}/></p>
        <p>
          <UIText text={"Our only analytics is Cloudflare Web Analytics: a small cookieless script Cloudflare adds to our pages that counts page views and page load times in aggregate. It doesn't use cookies or build a profile of you. We run no other analytics."}/></p>
      </Part>

      <Part title="How long we keep it">
        <p>
          <UIText text={"We keep account and profile data while your account exists, and delete or anonymise it after you ask us to delete your account, within 30 days of the request, except where we must keep records by law. Server logs are kept for up to 30 days. On-chain data is public and permanent and isn't ours to delete."}/></p>
      </Part>

      <Part title="Your choices and rights">
        <p>
          <UIText text={"You can edit your profile and delete your posts in the app. You can ask us to access, correct, export or delete your personal data, or object to how we use it, by contacting us above. Depending on where you live, you may also have the right to complain to your data protection authority."}/></p>
      </Part>

      <Part title="Children">
        <p><UIText text={"CLASHR is not for anyone under 18, and we don't knowingly collect their data."}/></p>
      </Part>

      <Part title="Changes">
        <p><UIText text={"We'll update this page when our practices change; the date at the top shows the latest version."}/></p>
      </Part>
    </LegalPage>
  );
}
