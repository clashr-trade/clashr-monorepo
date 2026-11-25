import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import Whitepaper from '../app/(marketing)/whitepaper/page';
import Risk from '../app/(marketing)/risk/page';
import {LanguageProvider} from '../components/landing/language-provider';
import {WHITEPAPER_MD} from '../components/landing/whitepaper-source.generated';
import {WHITEPAPER_TRANSLATIONS} from '../lib/localized-documents';
import {parseMarkdown} from '../components/landing/markdown';

describe('Clashr whitepaper and document presentation',()=>{
  it('bundles the canonical source and preserves policy numbers across all editions',()=>{
    expect(WHITEPAPER_MD).toBe(readFileSync(new URL('../../../docs/whitepaper.md',import.meta.url),'utf8'));
    for(const md of [WHITEPAPER_MD,...Object.values(WHITEPAPER_TRANSLATIONS)]){
      expect(parseMarkdown(md).filter(b=>b.t==='h'&&b.level===2)).toHaveLength(9);
      for(const value of ['0%','0.25%','0.5%','1,000,000','10,000,000','50,000,000','1,000,000,000','5.6%','89.4%','20%','25%','50%','80%','Q4 2026','Q1 2027','Flap','PancakeSwap'])expect(md).toContain(value);
      expect(md).not.toMatch(/RUSHR|PONS|Robinhood|4663|0xa8ceeeb747fcf136947c35c5de6187ee90d6bfed/);
    }
    expect(WHITEPAPER_MD).toContain('0% Clashr platform fee');
    expect(WHITEPAPER_MD).toContain('planned terms');
    expect(WHITEPAPER_MD).toContain('No historical buyback or reward payment is claimed');
  });
  it.each(['en','zh-CN','ja'] as const)('renders the adapted document in %s without the paper-theme override',language=>{
    const html=renderToStaticMarkup(<LanguageProvider initialLanguage={language}><Whitepaper/></LanguageProvider>);
    expect(html).toContain('clashr-docs');expect(html).not.toContain('class="theme-paper');
    expect(html).not.toMatch(/\$RUSHR|PONS|Robinhood/);
    expect(html).toContain('0.25%');expect(html).toContain('0.5%');
    expect(html).toContain('https://github.com/clashr-trade/clashr-monorepo');
  });
  it('uses the same document shell for risk disclosure',()=>{
    const html=renderToStaticMarkup(<LanguageProvider initialLanguage="en"><Risk/></LanguageProvider>);
    expect(html).toContain('clashr-docs');expect(html).not.toContain('class="theme-paper');
    expect(html).toContain('Risk disclosure');
  });
});
