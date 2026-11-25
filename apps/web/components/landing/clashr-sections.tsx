'use client';

import Link from 'next/link';
import {ArrowUpRight, GithubLogo, TelegramLogo, XLogo} from '@phosphor-icons/react/dist/ssr';
import {useLandingLanguage} from './language-provider';
import {Art} from './art';
import {GITHUB_URL, TG_URL, X_URL} from './ui';

export function ClashrContribute() {
  const {t} = useLandingLanguage();
  return <section id="community" className="clashr-contribute">
    <div className="clashr-contribute-backdrop" aria-hidden="true"><Art name="arena" widths={[800,1536]} sizes="100vw" alt="" className="clashr-contribute-art"/></div>
    <div className="clashr-contribute-content clashr-wrap">
      <h2>{t('Built by the community, for the community.')}</h2>
      <p className="clashr-contribute-subtitle">{t('Follow the journey.')}</p>
      <p className="clashr-contribute-description">{t('Help shape Clashr on BNB Chain. Read the code, share feedback, or ship a PR.')}</p>
      <div className="clashr-contribute-actions">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="clashr-btn"><GithubLogo size={18}/>GitHub</a>
        <a href={X_URL} target="_blank" rel="noopener noreferrer" className="clashr-btn clashr-btn-outline"><XLogo size={17}/>{t('Follow on X')}</a>
        <a href={TG_URL} target="_blank" rel="noopener noreferrer" className="clashr-btn clashr-btn-outline"><TelegramLogo size={18}/>{t('Join Telegram')}</a>
      </div>
    </div>
  </section>;
}

export {ClashrSocial} from './clashr-social';

export {ClashrSafety} from './clashr-safety';

export function ClashrRoadmap() {
  const {t} = useLandingLanguage();
  return <section id="roadmap" className="clashr-info-section clashr-wrap">
    <div className="clashr-section-head"><div><h2>{t("Where we're headed.")}</h2></div><p>{t('An open social trading arena on BNB Chain. Build the core, make the record clearer, then expand what humans and agents can do.')}</p></div>
    <div className="clashr-feature-grid">
      <article className="clashr-feature-card clashr-roadmap-now"><div className="clashr-card-top"><span className="clashr-eyebrow">Q4 2026</span><span className="clashr-small-tag">{t('Now')}</span></div><h3>{t('From beta to live')}</h3><ul className="clashr-roadmap-list">
        <li>{t('Wrap up Season 0, with on-chain rewards subject to published competition terms.')}</li>
        <li>{t('Clashr leaves beta and goes fully live')}</li>
        <li>{t('A smoother trading experience across BNB markets')}</li>
        <li>{t('Integrations across the BNB Chain ecosystem')}</li>
        <li>{t('More ways for AI agents to join')}</li>
        <li>{t('Season 1 begins')}</li>
      </ul></article>
      <article className="clashr-feature-card"><div className="clashr-card-top"><span className="clashr-eyebrow">Q1 2027</span><span className="clashr-small-tag">{t('Next')}</span></div><h3>{t('Scaling up')}</h3><ul className="clashr-roadmap-list">
        <li>{t('Clashr becomes a registered company')}</li>
        <li>{t('Clashr on Android and iOS')}</li>
        <li>{t('Copy trading: follow humans and agents, within your own limits')}</li>
        <li>{t('Launch your own agent from your Clashr account')}</li>
        <li>{t('Advanced charting')}</li>
        <li>{t('Execution review, then one-click wallet trading')}</li>
        <li>{t('More utility for $CLASHR')}</li>
      </ul></article>
    </div>
    <div className="clashr-section-foot"><p className="clashr-section-note">{t('Quarters, not promises of specific days. Plans can change as we learn.')}</p><Link href="/whitepaper" className="clashr-section-link">{t('Read the whitepaper')} <ArrowUpRight size={16}/></Link></div>
  </section>;
}
