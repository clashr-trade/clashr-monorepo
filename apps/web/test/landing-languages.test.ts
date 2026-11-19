import { describe, expect, it } from 'vitest';
import { LANDING_LANGUAGES, landingLanguage, translateLanding } from '../lib/landing-languages';
import { WHITEPAPER_TRANSLATIONS } from '../lib/localized-documents';
import { LEGAL_COPY } from '../lib/legal-copy';
import { parseMarkdown } from '../components/landing/markdown';
import { readFileSync } from 'node:fs';

describe('landing language preference', () => {
  it('defaults missing or unsupported saved values to Chinese', () => {
    for (const value of [null, undefined, '', 'fr', 'constructor'])
      expect(landingLanguage(value)).toBe('zh-CN');
    for (const { code } of LANDING_LANGUAGES) expect(landingLanguage(code)).toBe(code);
  });
  it('translates public labels while preserving English source copy', () => {
    expect(translateLanding('Copy CA', 'zh-CN')).toBe('复制 CA');
    expect(translateLanding('Copy CA', 'ja')).toBe('CAをコピー');
    expect(translateLanding('Copy CA', 'en')).toBe('Copy CA');
    expect(translateLanding('CLASHR', 'zh-CN')).toBe('CLASHR');
  });
  it('covers the main platform controls in both translated languages', () => {
    for (const language of ['zh-CN', 'ja'] as const) {
      for (const label of [
        'New pairs',
        'Almost bonded',
        'Migrated',
        'Feed',
        'Follow',
        'Buy',
        'Sell',
        'Settings',
        'Connect wallet',
        'Token status',
      ]) {
        expect(translateLanding(label, language), `${language}: ${label}`).not.toBe(label);
      }
    }
  });
  it('preserves all twelve whitepaper sections in each localized edition', () => {
    for (const source of Object.values(WHITEPAPER_TRANSLATIONS)) {
      const headings = parseMarkdown(source).filter(
        (block) => block.t === 'h' && block.level === 2,
      );
      expect(headings).toHaveLength(12);
    }
  });
  it('provides both translations for every rendered legal paragraph', () => {
    for (const route of ['terms', 'privacy', 'risk']) {
      const source = readFileSync(
        new URL(`../app/(marketing)/${route}/page.tsx`, import.meta.url),
        'utf8',
      );
      for (const match of source.matchAll(/<UIText text=\{("(?:[^"\\]|\\.)*")\}/g)) {
        const text = JSON.parse(match[1]!);
        expect(LEGAL_COPY[text], `${route}: ${text}`).toHaveLength(2);
        expect(LEGAL_COPY[text]!.every((value) => value.trim().length > 0)).toBe(true);
      }
    }
  });
});
