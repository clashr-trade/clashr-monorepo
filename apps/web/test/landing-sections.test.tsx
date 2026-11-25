import {describe, expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ClashrLanding} from '../components/landing/clashr-landing';
import {LanguageProvider} from '../components/landing/language-provider';
import {translateLanding, type LandingLanguage} from '../lib/landing-languages';

function render(language: LandingLanguage) {
  return renderToStaticMarkup(<LanguageProvider initialLanguage={language}><ClashrLanding board={null}/></LanguageProvider>);
}

describe('Clashr landing navigation and BNB sections', () => {
  it('connects each new header link to exactly one section', () => {
    const html = render('en');
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    for (const id of ['social','safety','roadmap']) {
      expect(header).toContain(`href="/#${id}"`);
      expect(html.match(new RegExp(`id="${id}"`, 'g'))).toHaveLength(1);
    }
    expect(header).toContain('clashr-beta');
  });

  it('separates examples, available safety coverage and future work', () => {
    const html = render('en');
    expect(html).toContain('Open the feed for current calls.');
    expect(html).not.toContain('/art/clashr-social-1600.webp');
    expect(html).not.toContain('/art/clashr-safety-1600.webp');
    expect(html).toContain('clashr-safety-terminal');
    expect(html).toContain('Coverage varies');
    expect(html).toContain('Quarters, not promises of specific days. Plans can change as we learn.');
    expect(html).toContain('Q4 2026');
    expect(html).toContain('Q1 2027');
    expect(html).toContain('Integrations across the BNB Chain ecosystem');
    expect(html).toContain('More utility for $CLASHR');
    expect(html).not.toMatch(/Robinhood|\$RUSHR|Rushr/);
  });

  it.each(['zh-CN','ja'] as const)('renders the new sections in %s', language => {
    const html = render(language);
    for (const label of ['Social','Safety','Roadmap','Your calls, on the record.','Interactive interface preview. Open a market for current data and wallet trading.',"Where we're headed.",'Open the feed for current calls.','From beta to live','Scaling up']) {
      const localized = translateLanding(label,language);
      expect(localized).not.toBe(label);
      expect(html).toContain(localized);
    }
  });
});
