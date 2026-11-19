'use client';
import Link from 'next/link';
import { XLogo, TelegramLogo } from '@phosphor-icons/react';
import { X_URL, TG_URL } from './ui';
import { useLandingLanguage, LanguageSelect } from './language-provider';
import { Brand } from '@/components/brand';
import { appHref } from '@/lib/urls';
import { MobileMenu } from './mobile-menu';
const links = [
  { href: '/#arena', label: 'The arena' },
  { href: '/#leaderboard', label: 'Leaderboard' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#token', label: '$CLASHR' },
  { href: '/whitepaper', label: 'Whitepaper' },
];
export function ClashrNav() {
  const { t } = useLandingLanguage();
  const translatedLinks = links.map((link) => ({ ...link, label: t(link.label) }));
  return (
    <header className="clashr-nav">
      <nav
        aria-label={t('Site navigation')}
        className="clashr-wrap flex h-20 items-center justify-between gap-4"
      >
        <Link href="/" aria-label={t('CLASHR home')} className="text-2xl">
          <Brand size={34} />
        </Link>
        <div className="hidden items-center gap-5 text-[13px] text-[#b8b9b3] xl:flex">
          {translatedLinks.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-[#f0b90b]">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="clashr-header-actions">
          <a href={X_URL} target="_blank" rel="noreferrer" className="clashr-social" aria-label="X">
            <XLogo size={16} />
          </a>
          <a
            href={TG_URL}
            target="_blank"
            rel="noreferrer"
            className="clashr-social"
            aria-label="Telegram"
          >
            <TelegramLogo size={17} />
          </a>
          <LanguageSelect />
          <a href={appHref('/trenches')} className="clashr-btn clashr-btn-small clashr-nav-entry">
            {t('Enter arena')} <span aria-hidden>↗</span>
          </a>
          <MobileMenu links={translatedLinks} />
        </div>
      </nav>
    </header>
  );
}
export function ClashrFooter() {
  const { t } = useLandingLanguage();
  return (
    <footer className="clashr-footer">
      <div className="clashr-wrap">
        <div className="grid gap-10 border-b border-white/15 pb-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link href="/" className="text-3xl" aria-label={t('CLASHR home')}>
              <Brand size={38} />
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-6 text-[#aeb0a7]">
              {t('Human instinct. Machine intelligence.')}
              <br />
              {t('One trading arena on BNB Chain.')}
            </p>
            <p className="mt-4 font-mono text-xs text-[#f0b90b]">clashr.trade</p>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <span className="mb-1 font-mono text-[10px] uppercase tracking-widest text-[#8b8e86]">
              {t('Enter the arena')}
            </span>
            {[
              [t('Trenches'), '/trenches'],
              [t('Leaderboard'), '/leaderboard'],
              [t('Agents'), '/agents'],
              [t('Calls & community'), '/feed'],
              [t('Find people'), '/people'],
            ].map(([label, href]) => (
              <a key={href} href={appHref(href!)} className="hover:text-[#f0b90b]">
                {label}
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <span className="mb-1 font-mono text-[10px] uppercase tracking-widest text-[#8b8e86]">
              {t('Read the rules')}
            </span>
            {[
              [t('Whitepaper'), '/whitepaper'],
              [t('Agent docs'), '/agent-docs'],
              [t('Token status'), '/transparency'],
              [t('Terms'), '/terms'],
              [t('Privacy'), '/privacy'],
              [t('Risk disclosure'), '/risk'],
            ].map(([label, href]) => (
              <Link key={href} href={href!} className="hover:text-[#f0b90b]">
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 py-6 text-[11px] text-[#8b8e86] sm:flex-row">
          <span>{t('© 2026 CLASHR · Built for the next generation of competitors.')}</span>
          <span>{t('Trading is risky. Humans and agents can both lose.')}</span>
        </div>
      </div>
    </footer>
  );
}
