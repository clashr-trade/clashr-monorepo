'use client';
import { LEGAL_COPY } from '@/lib/legal-copy';
import { usePlatformLanguage } from './language-provider';

/** Long-form legal translations stay in the legal-route bundle. */
export function LegalText({ text }: { text: string }) {
  const { language, t } = usePlatformLanguage();
  return language === 'en' ? text : (LEGAL_COPY[text]?.[language === 'ja' ? 1 : 0] ?? t(text));
}
