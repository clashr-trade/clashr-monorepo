import {describe,it,expect} from 'vitest';
import {privyConfig} from '../lib/privy-config';

describe('Clashr sign-in',()=>{
  it('offers email sign-up and MetaMask with an embedded BNB trading wallet',()=>{
    const config=privyConfig('http://localhost:3000',true);
    expect(config.loginMethods).toEqual(['email','wallet']);
    expect(config.appearance?.walletList).toContain('metamask');
    expect(config.embeddedWallets?.ethereum?.createOnLogin).toBe('all-users');
    expect(config.defaultChain?.id).toBe(56);
    expect(config.supportedChains?.map(c=>c.id)).toEqual([56]);
    expect(config.appearance).toMatchObject({landingHeader:'Sign in to Clashr',logo:'/brand/clashr/mark-white.svg',accentColor:'#f0b90b'});
    expect(config.legal).toMatchObject({termsAndConditionsUrl:'http://localhost:3000/terms',privacyPolicyUrl:'http://localhost:3000/privacy'});
  });
  it('preserves the legacy product chain when BNB mode is off',()=>{
    expect(privyConfig('https://clashr.trade',false).defaultChain?.id).toBe(4663);
  });
});
