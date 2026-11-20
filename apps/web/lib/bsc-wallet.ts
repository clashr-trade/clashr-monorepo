'use client';

import { storageKey } from './brand-compat';
import { createWalletClient, custom, formatUnits,parseUnits,type EIP1193Provider } from 'viem';
import { bsc } from 'viem/chains';
import {BSC_PUBLIC_RPC} from '@clashr/core/chain/bsc-rpc';
export {bscSigningEnabled} from './bsc-flags';

export type BscInjectedProvider = EIP1193Provider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};
let embeddedProvider:BscInjectedProvider|null=null;
export function setBscEmbeddedProvider(provider:BscInjectedProvider|null){embeddedProvider=provider;}
export function bscWalletProvider(): BscInjectedProvider | null {
  if (typeof window === 'undefined') return null;
  if(embeddedProvider)return embeddedProvider;
  const provider = (window as unknown as { ethereum?: BscInjectedProvider }).ethereum;
  return provider && typeof provider.request === 'function' ? provider : null;
}
export function bscWalletClient(provider: BscInjectedProvider) {
  return createWalletClient({ chain: bsc, transport: custom(provider) });
}
export async function switchBscWalletChain(provider:BscInjectedProvider) {
  const switchChain=()=>provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});
  try { await switchChain(); }
  catch(error) {
    if((error as {code?:number})?.code!==4902)throw error;
    await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x38',chainName:'BNB Smart Chain',
      nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},rpcUrls:[BSC_PUBLIC_RPC],blockExplorerUrls:['https://bscscan.com']}]});
    await switchChain();
  }
  const chain=await provider.request({method:'eth_chainId'});
  if(typeof chain!=='string'||!/^0x[0-9a-f]+$/i.test(chain)||BigInt(chain)!==56n)throw new Error('Wallet did not switch to BNB Smart Chain');
}
export function parseBscInput(text: string, decimals: number): bigint {
  if (!/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(text) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Enter a positive decimal amount');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error(`This asset supports at most ${decimals} decimal places`);
  const amount = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error('Amount is outside the supported range');
  return amount;
}

/** USD is an indicative spending budget; execution still reviews the exact BNB amount. */
export function bnbAmountForUsd(value:string,bnbUsd:number):string {
  if(!Number.isFinite(bnbUsd)||bnbUsd<=0)throw new Error('BNB/USD price unavailable');
  const rate=parseUnits(bnbUsd.toFixed(8),8);if(rate<=0n)throw new Error('BNB/USD price unavailable');
  const amount=parseBscInput(value,2)*10n**24n/rate;
  if(amount<=0n)throw new Error('Budget is too small');
  return formatUnits(amount,18);
}
export function assetAmountForUsd(value:string,usdPerAsset:number,decimals:number):string {
 if(!Number.isInteger(decimals)||decimals<0||decimals>36||!Number.isFinite(usdPerAsset)||usdPerAsset<=0)throw new Error('Asset/USD price unavailable');
 const rate=parseUnits(usdPerAsset.toFixed(8),8);if(rate<=0n)throw new Error('Asset/USD price unavailable');
 const amount=parseBscInput(value,2)*10n**BigInt(decimals+6)/rate;
 if(amount<=0n)throw new Error('Budget is too small');return formatUnits(amount,decimals);
}
export function parseBscSlippage(text: string): number {
  const bps = parseBscInput(text, 2);
  if (bps > 500n) throw new Error('Slippage must be between 0.01% and 5%');
  return Number(bps);
}

export interface BscActivity {
  chainId: 56; account: string; token: string; hash: string; kind: 'approval' | 'swap';
  status: 'submitted' | 'mined' | 'finalized' | 'reverted' | 'replaced';
  networkFeeWei?: string; createdAt: string;
  expected?: { to: string; data: string; value: string };
  fill?: { side: 'buy' | 'sell'; tokenAmount: string; nativeAmount: string|null; tokenDecimals: number;
    settlement?:{asset:string;amount:string|null;maximum:string;decimals:number;symbol:string};
    meetsMinimum: boolean; provenance: 'canonical-receipt-events'; platformFeeWei: '0' };
}
const activityKey = (account: string) => storageKey(`bsc.activity.${account.toLowerCase()}`);
export function readBscActivity(storage: Pick<Storage, 'getItem'>, account: string): BscActivity[] {
  try {
    const rows: unknown = JSON.parse(storage.getItem(activityKey(account)) ?? '[]');
    return Array.isArray(rows) ? rows.filter((row): row is BscActivity => row?.chainId === 56 && row.account === account.toLowerCase()
      && /^0x[0-9a-f]{64}$/.test(row.hash) && /^0x[0-9a-f]{40}$/.test(row.token)
      && ['approval', 'swap'].includes(row.kind) && ['submitted', 'mined', 'finalized', 'reverted', 'replaced'].includes(row.status)
      && (row.networkFeeWei === undefined || /^[0-9]+$/.test(row.networkFeeWei))
      && (row.fill === undefined || (!!row.fill && ['buy','sell'].includes(row.fill.side)
        && /^[0-9]+$/.test(row.fill.tokenAmount) && (row.fill.nativeAmount===null||/^[0-9]+$/.test(row.fill.nativeAmount))
        && (row.fill.settlement===undefined||(/^0x[0-9a-f]{40}$/i.test(row.fill.settlement.asset)&&(row.fill.settlement.amount===null||/^\d+$/.test(row.fill.settlement.amount))&&/^\d+$/.test(row.fill.settlement.maximum)&&Number.isInteger(row.fill.settlement.decimals)&&row.fill.settlement.decimals>=0&&row.fill.settlement.decimals<=36&&typeof row.fill.settlement.symbol==='string'&&row.fill.settlement.symbol.length<=40))
        && Number.isInteger(row.fill.tokenDecimals) && row.fill.tokenDecimals >= 0 && row.fill.tokenDecimals <= 36
        && typeof row.fill.meetsMinimum === 'boolean' && row.fill.provenance === 'canonical-receipt-events' && row.fill.platformFeeWei === '0'))
      && (row.expected === undefined || (!!row.expected && /^0x[0-9a-f]{40}$/.test(row.expected.to)
        && /^0x(?:[0-9a-f]{2})*$/.test(row.expected.data) && /^[0-9]+$/.test(row.expected.value)))).slice(0, 50) : [];
  } catch { return []; }
}
export function saveBscActivity(storage: Pick<Storage, 'getItem' | 'setItem'>, account: string, item: BscActivity): BscActivity[] {
  if (item.chainId !== 56 || item.account !== account.toLowerCase()) throw new Error('BSC activity account mismatch');
  const previous = readBscActivity(storage, account);
  const prior = previous.find(row => row.hash === item.hash);
  const merged = { ...prior, ...item, expected: item.expected === undefined ? prior?.expected : item.expected };
  const rows = [merged, ...previous.filter(row => row.hash !== item.hash)].slice(0, 50);
  storage.setItem(activityKey(account), JSON.stringify(rows));
  return rows;
}
