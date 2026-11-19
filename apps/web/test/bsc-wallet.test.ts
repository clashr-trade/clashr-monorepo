import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetAmountForUsd,bnbAmountForUsd,bscSigningEnabled, switchBscWalletChain, parseBscInput, parseBscSlippage, readBscActivity, saveBscActivity, type BscActivity, type BscInjectedProvider } from '../lib/bsc-wallet';
const account='0x'+'1'.repeat(40),token='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64);
const entry:BscActivity={chainId:56,account,token,hash,kind:'swap',status:'submitted',createdAt:'2026-11-17T00:00:00Z',expected:{to:token,data:'0x1234',value:'0'}};
afterEach(()=>vi.unstubAllEnvs());
describe('BSC wallet amount and rollout boundaries',()=>{
  it('converts USD using actual quote decimals and preserves quote settlement activity',()=>{
    expect(assetAmountForUsd('10',2,6)).toBe('5');expect(assetAmountForUsd('0.01',1000,6)).toBe('0.00001');
    expect(assetAmountForUsd('10',500,18)).toBe(bnbAmountForUsd('10',500));
    expect(()=>assetAmountForUsd('10',0,6)).toThrow();
    let raw='';const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
    saveBscActivity(storage,account,{...entry,fill:{side:'buy',tokenAmount:'1000',tokenDecimals:18,nativeAmount:null,settlement:{asset:'0x'+'0'.repeat(40),amount:null,maximum:'123',decimals:18,symbol:'BNB'},meetsMinimum:true,provenance:'canonical-receipt-events',platformFeeWei:'0'}});
    expect(readBscActivity(storage,account)[0]?.fill?.nativeAmount).toBeNull();expect(readBscActivity(storage,account)[0]?.fill?.settlement?.maximum).toBe('123');
  });
  it('converts USD presets into exact BNB budgets while rejecting unavailable rates and excessive dollar precision',()=>{
    expect(bnbAmountForUsd('10',500)).toBe('0.02');
    expect(bnbAmountForUsd('0.01',1000)).toBe('0.00001');
    for(const rate of [0,-1,NaN,Infinity])expect(()=>bnbAmountForUsd('10',rate)).toThrow();
    expect(()=>bnbAmountForUsd('1.001',500)).toThrow();
  });
  it('parses exact raw amounts without rounding, exponent notation or silent precision loss',()=>{
    expect(parseBscInput('0.000000000000000001',18)).toBe(1n);
    expect(parseBscInput('123.456789',6)).toBe(123456789n);
    for(const input of ['0','-1','1e6','0.0000001','NaN','1,000'])expect(()=>parseBscInput(input,6)).toThrow();
    expect(parseBscSlippage('0.01')).toBe(1);expect(parseBscSlippage('5')).toBe(500);
    expect(()=>parseBscSlippage('5.01')).toThrow();expect(()=>parseBscSlippage('1.001')).toThrow();
  });
  it('requires explicit BSC opt-in independently of shared API preview and Robinhood signing',()=>{
    vi.stubEnv('NEXT_PUBLIC_SWAP_ENABLED','1');vi.stubEnv('NEXT_PUBLIC_BSC_SWAP_ENABLED','0');expect(bscSigningEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_BSC_SWAP_ENABLED','1');vi.stubEnv('NEXT_PUBLIC_PREVIEW_ONLY','1');expect(bscSigningEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_SWAP_ENABLED','0');expect(bscSigningEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ONLY','0');expect(bscSigningEnabled()).toBe(true);
  });
  it('adds only official BSC metadata when the wallet does not know chain 56, then verifies the result',async()=>{
    let first=true;
    const request=vi.fn(async({method}:{method:string})=>{
      if(method==='wallet_switchEthereumChain'&&first){first=false;throw {code:4902};}
      return method==='eth_chainId'?'0x38':null;
    });
    await switchBscWalletChain({request} as unknown as BscInjectedProvider);
    expect(request.mock.calls.map(([call])=>call.method)).toEqual(['wallet_switchEthereumChain','wallet_addEthereumChain','wallet_switchEthereumChain','eth_chainId']);
    expect(request.mock.calls[1]![0]).toMatchObject({params:[{chainId:'0x38',rpcUrls:['https://bsc-dataseed.bnbchain.org'],nativeCurrency:{symbol:'BNB',decimals:18}}]});
    await expect(switchBscWalletChain({request:async()=> '0x61'} as unknown as BscInjectedProvider)).rejects.toThrow('did not switch');
  });
});
describe('wallet-local BSC receipt recovery',()=>{
  it('preserves submitted calldata for later receipt checks and isolates chain/account history',()=>{
    const data=new Map<string,string>();const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
    saveBscActivity(storage,account,entry);
    const [updated]=saveBscActivity(storage,account,{...entry,expected:undefined,status:'mined',networkFeeWei:'123'});
    // An absent field must not erase the original review binding.
    expect(updated?.expected).toEqual(entry.expected);
    expect(readBscActivity(storage,account)).toHaveLength(1);
    expect(readBscActivity(storage,token)).toEqual([]);
    expect(()=>saveBscActivity(storage,token,entry)).toThrow('account mismatch');
    data.set(`rushr.bsc.activity.${account}`,JSON.stringify([{...entry,chainId:4663},entry,{...entry,expected:null}]));
    expect(readBscActivity(storage,account)).toEqual([entry]);
  });
});
