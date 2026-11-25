import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {WHITEPAPER_MD} from '../components/landing/whitepaper-source.generated';
import {WHITEPAPER_TRANSLATIONS} from '../lib/localized-documents';
import {parseMarkdown} from '../components/landing/markdown';
import {WhitepaperBody} from '../components/landing/whitepaper';
import {LanguageProvider} from '../components/landing/language-provider';
const source=(suffix='')=>readFileSync(new URL('../../../docs/whitepaper'+suffix+'.md',import.meta.url),'utf8');
describe('adapted Clashr whitepaper',()=>{
 it('bundles the approved source documents for all three languages',()=>{
  expect(WHITEPAPER_MD).toBe(source());
  expect(WHITEPAPER_TRANSLATIONS['zh-CN']).toBe(source('.zh-CN'));expect(WHITEPAPER_TRANSLATIONS.ja).toBe(source('.ja'));
  expect(WHITEPAPER_MD).toContain('Version 0.3');
  for(const doc of [WHITEPAPER_MD,...Object.values(WHITEPAPER_TRANSLATIONS)]){
   expect(doc).not.toMatch(/\b(?:rushr|pons|robinhood|uniswap)\b/i);
   expect(doc).toContain('CLASHR');expect(doc).toContain('BNB');expect(doc).toContain('Flap');
   expect(parseMarkdown(doc).filter(b=>b.t==='h'&&b.level===2)).toHaveLength(9);
  }
 });
 it('preserves fees, allocation, rewards and roadmap rather than the shorter thesis draft',()=>{
  for(const text of ['## 4. Fees','0.25%','0.5%','1,000,000,000','25%','50%','## 6. Buybacks, burns and competition rewards','## 7. Transparency','Q4 2026','Q1 2027'])expect(WHITEPAPER_MD).toContain(text);
  expect(WHITEPAPER_MD).toContain('0% Clashr platform fee');expect(WHITEPAPER_MD).toContain('planned terms');
 });
 it('renders Clashr branding and keeps site links on the active frontend',()=>{
  const blocks=parseMarkdown('[Open the arena](https://clashr.trade/trenches) [Source](https://github.com/clashr-trade)');
  const html=renderToStaticMarkup(<LanguageProvider initialLanguage="en"><WhitepaperBody blocks={blocks}/></LanguageProvider>);
  expect(html).toContain('href="/trenches"');expect(html).toContain('href="https://github.com/clashr-trade"');
  const renderer=readFileSync(new URL('../components/landing/whitepaper.tsx',import.meta.url),'utf8');expect(renderer).not.toMatch(/RUSHR/);expect(renderer).toContain('Proposed CLASHR launch distribution');
 });
});
