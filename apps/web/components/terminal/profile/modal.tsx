'use client';

import {usePlatformLanguage} from '@/components/landing/language-provider';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';

/**
 * Centered dialog, rendered into document.body (never inside a backdrop-filtered ancestor, which
 * would clip a fixed overlay: the wallet-drawer bug). Esc and the backdrop close it.
 */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const {t:translateUI}=usePlatformLanguage();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={translateUI("Close")} onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />
      <div className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-2xl border border-white/[0.08] bg-surface p-5 shadow-2xl ${wide ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{translateUI(title)}</h2>
          <button type="button" onClick={onClose} aria-label={translateUI("Close")} className="rounded-lg p-1.5 text-muted hover:bg-white/[0.05] hover:text-ink">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
