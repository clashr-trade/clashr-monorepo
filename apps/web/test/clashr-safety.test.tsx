import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ClashrSafety} from '../components/landing/clashr-safety';
import {LanguageProvider} from '../components/landing/language-provider';

describe('Safety landing components',()=>{
  it('renders separate terminal, contract and holder-map components with native controls',()=>{
    const html=renderToStaticMarkup(<LanguageProvider initialLanguage="en"><ClashrSafety/></LanguageProvider>);
    expect(html).not.toContain('/art/clashr-safety-');
    for(const name of ['clashr-safety-terminal','clashr-safety-copycat','clashr-safety-holder-map']) expect(html).toContain(name);
    expect(html.match(/<article /g)).toHaveLength(2);
    expect(html).toContain('aria-label="Trade side"');
    expect(html).toContain('aria-label="Chart interval"');
    expect(html).toContain('pattern="0x[a-fA-F0-9]{40}"');
    expect(html).toContain('href="/token/0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82"');
    expect(html).toContain('https://bscscan.com/token/0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82');
    expect(html).toContain('Coming soon');
    expect(html).toContain('Spot the fake before anyone buys it.');
    expect(html).toContain('clashr-safety-trades-preview');
    expect(html).toContain('clashr-safety-market-stats');
    expect(html).toContain('clashr-safety-risk-examples');
    expect(html).toContain('Illustrative market figures and risk examples.');
    expect(html).toContain('Illustrative chart. Not live market data.');
    expect(html).not.toMatch(/Fake.*caught|19 copies|Robinhood|PONS/);
  });
});
