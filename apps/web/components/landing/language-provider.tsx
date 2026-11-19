'use client';

import { useCallback, useEffect, useSyncExternalStore, useId, useRef, useState } from 'react';
import { Globe, CaretDown, Check } from '@phosphor-icons/react';
import {
  LANDING_LANGUAGES,
  landingLanguage,
  translateLanding,
  type LandingLanguage,
} from '@/lib/landing-languages';

const STORAGE_KEY = 'clashr.language';
const CHANGE_EVENT = 'clashr:language';
let memoryLanguage: LandingLanguage | null = null;
const serverLanguage = (): LandingLanguage => 'zh-CN';
function currentLanguage(): LandingLanguage {
  if (memoryLanguage) return memoryLanguage;
  try {
    const cookie = document.cookie
      .split('; ')
      .find((item) => item.startsWith(STORAGE_KEY + '='))
      ?.split('=')[1];
    return landingLanguage(cookie ?? localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'zh-CN';
  }
}
const listeners = new Set<() => void>();
const notifyLanguage = () => {
  for (const notify of listeners) notify();
};
const onStorage = (event: StorageEvent) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    memoryLanguage = null;
    notifyLanguage();
  }
};
const onFocus = () => {
  memoryLanguage = null;
  notifyLanguage();
};
function subscribe(notify: () => void) {
  if (!listeners.size) {
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, notifyLanguage);
    window.addEventListener('focus', onFocus);
  }
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
    if (!listeners.size) {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, notifyLanguage);
      window.removeEventListener('focus', onFocus);
    }
  };
}
function selectLanguage(language: LandingLanguage) {
  memoryLanguage = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    /* Selection still works without persistence. */
  }
  const domain =
    location.hostname === 'clashr.trade' || location.hostname.endsWith('.clashr.trade')
      ? '; Domain=clashr.trade'
      : '';
  try {
    document.cookie =
      STORAGE_KEY +
      '=' +
      language +
      '; Path=/; Max-Age=31536000; SameSite=Lax' +
      domain +
      (location.protocol === 'https:' ? '; Secure' : '');
  } catch {
    /* The in-memory choice remains available. */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useLandingLanguage() {
  // Each streamed boundary uses the server snapshot while it hydrates, even if
  // another section has already switched to the saved browser preference.
  const language = useSyncExternalStore(subscribe, currentLanguage, serverLanguage);
  const t = useCallback(
    <T,>(text: T): T extends string ? string : T =>
      (typeof text === 'string' ? translateLanding(text, language) : text) as T extends string
        ? string
        : T,
    [language],
  );
  return { language, t, setLanguage: selectLanguage };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLandingLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return children;
}

export const usePlatformLanguage = useLandingLanguage;
export function UIText({ text }: { text: string | null | undefined }) {
  const { t } = usePlatformLanguage();
  return t(text ?? '');
}

export function LanguageSelect() {
  const { language, t, setLanguage } = usePlatformLanguage();
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    id = useId();
  const selected = LANDING_LANGUAGES.findIndex((item) => item.code === language);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="option"][tabindex="0"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [open, active]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="clashr-language"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="clashr-language-trigger"
        aria-label={t('Language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setActive(selected);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(selected);
            setOpen(true);
          }
        }}
      >
        <Globe size={16} />
        <span>{LANDING_LANGUAGES[selected]?.label}</span>
        <CaretDown size={11} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div
          id={id}
          role="listbox"
          aria-label={t('Language')}
          className="clashr-language-menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
            if (event.key === 'Tab') setOpen(false);
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              setActive((index) =>
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? LANDING_LANGUAGES.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : LANDING_LANGUAGES.length - 1)) %
                      LANDING_LANGUAGES.length,
              );
            }
          }}
        >
          {LANDING_LANGUAGES.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={language === item.code}
              tabIndex={active === index ? 0 : -1}
              key={item.code}
              lang={item.code}
              onFocus={() => setActive(index)}
              onClick={() => {
                setLanguage(item.code);
                close();
              }}
            >
              <span>{item.label}</span>
              {language === item.code && <Check size={15} weight="bold" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LandingLoading() {
  const { t } = useLandingLanguage();
  return (
    <div className="clashr-board-loading" aria-busy="true">
      {t('Loading the scoreboard…')}
    </div>
  );
}
