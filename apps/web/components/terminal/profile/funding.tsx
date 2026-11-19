'use client';

import {usePlatformLanguage} from '@/components/landing/language-provider';
import { useState } from 'react';
import { ArrowSquareOut, Bank, Check, Copy, CreditCard, Shuffle, Warning } from '@phosphor-icons/react';
import { USDG } from '@/lib/balances';
import { EXPLORER } from '@/lib/format';

/**
 * Own-profile funding (the Deposit modal). Only options verified to reach Robinhood Chain (4663) are shown
 * (research 2026-11-12: Robinhood app transfers, Relay and Across bridges, MoonPay for USDG, the
 * canonical Arbitrum bridge). Links are exact official URLs: lookalike "Robinhood bridge" phishing
 * sites exist.
 */
const ETH = '0x0000000000000000000000000000000000000000';
const relayUrl = (to: string, token: string) =>
  `https://relay.link/bridge/robinhood?fromChainId=8453&toAddress=${to}&toCurrency=${token}`;
const ACROSS_URL = 'https://across.to/?to=robinhood';
const CANONICAL_URL = 'https://portal.arbitrum.io/bridge?sourceChain=ethereum&destinationChain=robinhood-chain';
const MOONPAY_URL = 'https://www.moonpay.com/buy';

/** Deposit modal body: the address, the chain warning, and every verified way to fund it. */
export function DepositPanel({ address }: { address: `0x${string}` | null }) {
  const {t:translateUI}=usePlatformLanguage();
  const [copied, setCopied] = useState(false);
  if(BNB_PRODUCT)return <div><p className="text-[11px] text-muted">{translateUI("Your wallet on BNB Smart Chain · chain 56")}</p>
    <p className="mt-3 break-all rounded-xl border border-white/10 bg-bg p-3 font-mono text-xs">{address??'Connect a wallet first'}</p>
    <button disabled={!address} onClick={async()=>{try{await navigator.clipboard.writeText(address!);setCopied(true);}catch{setCopied(false);}}} className="mt-3 rounded-xl bg-ink px-4 py-2 text-sm text-bg">{copied?translateUI("Copied"):translateUI("Copy deposit address")}</button>
    <p className="mt-4 text-xs leading-relaxed text-muted">{translateUI("Send BNB or supported BEP-20 tokens to this address on BNB Smart Chain. Keep BNB available for network fees. Confirm chain 56 in the sending wallet before transferring.")}</p>
    <a href={`${EXPLORER}/address/${address??''}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-xs underline">{translateUI("View BNB wallet on BscScan")}</a></div>;
  return (
    <div>
      <div className="text-[11px] text-muted">{translateUI("Your CLASHR wallet on Robinhood Chain")}</div>
      {address ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 break-all rounded-xl border border-white/[0.06] bg-bg px-3 py-2 font-mono text-[13px]">{address}</span>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard?.writeText(address).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
            className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-bg hover:bg-white"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? translateUI("Copied") : translateUI("Copy")}
          </button>
          <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer" className="rounded-xl border border-white/[0.08] p-2 text-muted hover:text-ink" title={translateUI("Open in explorer")}>
            <ArrowSquareOut size={16} />
          </a>
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-muted">{translateUI("Creating your wallet…")}</p>
      )}
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-risk-medium">
        <Warning size={13} className="mt-px shrink-0" weight="fill" />
        {translateUI("Only send ETH or USDG on Robinhood Chain (chain ID 4663). Funds sent on another network won't arrive.")}</p>

      <h3 className="mt-5 text-sm font-semibold">{translateUI("Ways to add funds")}</h3>
      <div className="mt-2 space-y-2">
        <Option
          icon={Bank}
          title={translateUI("From Robinhood")}
          badge="Easiest"
          body={
            <>
              {translateUI("In the Robinhood app, buy ETH or USDG, tap")}<span className="text-ink">{translateUI("Send")}</span>{translateUI(", choose the")}{' '}
              <span className="text-ink">{translateUI("Robinhood Chain")}</span> {translateUI("network and paste your address above. Not available in New York.")}</>
          }
        />
        <Option
          icon={Shuffle}
          title={translateUI("Bridge from Base, Arbitrum or Ethereum")}
          body="Seconds, small fee. Your address is filled in on Relay; double-check it before you confirm."
          actions={
            address && (
              <>
                <ExtLink href={relayUrl(address, ETH)}>{translateUI("Bridge ETH (Relay)")}</ExtLink>
                <ExtLink href={relayUrl(address, USDG)}>{translateUI("Bridge USDG (Relay)")}</ExtLink>
                <ExtLink href={ACROSS_URL} subtle>
                  {translateUI("Across")}</ExtLink>
              </>
            )
          }
        />
        <Option
          icon={CreditCard}
          title={translateUI("Buy with card")}
          body="MoonPay sells USDG on Robinhood Chain (not in New York or Canada). Choose Robinhood Chain and paste your address. For ETH, buy on Base, then bridge with Relay."
          actions={<ExtLink href={MOONPAY_URL}>{translateUI("Open MoonPay")}</ExtLink>}
        />
        <details className="group rounded-xl border border-white/[0.06] bg-bg px-3 py-2.5 text-xs text-muted">
          <summary className="cursor-pointer select-none text-ink/80 marker:text-muted">{translateUI("Advanced: official bridge from Ethereum")}</summary>
          <p className="mt-2 leading-relaxed">
            {translateUI("Arbitrum's canonical bridge: about 10 minutes in, 7 days to withdraw, and you pay Ethereum gas. It sends to the wallet you connect there, so use it only with a wallet you control and then send on to your CLASHR address.")}</p>
          <div className="mt-2">
            <ExtLink href={CANONICAL_URL} subtle>
              {translateUI("Arbitrum bridge")}</ExtLink>
          </div>
        </details>
      </div>
    </div>
  );
}

function Option({ icon: Icon, title, badge, body, actions }: { icon: typeof Bank; title: string; badge?: string; body: React.ReactNode; actions?: React.ReactNode }) {
  const {t:translateUI}=usePlatformLanguage();
  return (
    <div className="rounded-xl border border-white/[0.06] bg-bg p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon size={16} className="text-brand" />
        {translateUI(title)}
        {badge && <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">{badge}</span>}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
      {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div>}
    </div>
  );
}

function ExtLink({ href, children, subtle = false }: { href: string; children: React.ReactNode; subtle?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${subtle ? 'border border-white/[0.08] text-muted hover:text-ink' : 'bg-white/[0.08] text-ink hover:bg-white/[0.12]'}`}
    >
      {children} <ArrowSquareOut size={12} />
    </a>
  );
}
import {BNB_PRODUCT} from '@/lib/product';
