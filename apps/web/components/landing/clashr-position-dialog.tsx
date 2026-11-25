'use client';
import {useEffect,useRef} from 'react';
import type {LandingPosition} from '@/lib/landing-position';
import {appHref} from '@/lib/urls';
import {ClashrPnlCard} from './clashr-social';
import {useLandingLanguage} from './language-provider';

/** Native modal keeps focus and Escape handling while the actual token workspace stays mounted. */
export function ClashrPositionDialog({position}:{position:LandingPosition}){
  const {t}=useLandingLanguage();
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;if(dialog&&!dialog.open)dialog.showModal();return()=>dialog?.close();},[position.handle,position.token]);
  return <dialog ref={ref} className="clashr-position-dialog" aria-label={t('Recorded PnL')} onClick={event=>{if(event.target===ref.current)ref.current?.close();}}>
    <div className="clashr-position-dialog-head"><a href={appHref(`/u/${encodeURIComponent(position.handle)}`)}>@{position.handle}</a><form method="dialog"><button type="submit">{t('Close')}</button></form></div>
    <ClashrPnlCard position={position} linked={false}/>
  </dialog>;
}
