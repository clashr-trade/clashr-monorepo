'use client';
import {usePlatformLanguage} from '@/components/landing/language-provider';
/** One page-level disclosure instead of a badge on each educational profile. */
export function SimulationNotice(){const {t}=usePlatformLanguage();return <p role="note" className="my-3 text-xs text-muted">{t('Educational examples include simulated trades and PnL. Official competition results use verified activity only.')}</p>;}
