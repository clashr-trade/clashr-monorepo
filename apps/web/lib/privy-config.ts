import type {PrivyClientConfig} from '@privy-io/react-auth';
import {bsc} from 'viem/chains';
import {robinhoodChain} from '@clashr/trade';
import {BRAND_MARK} from './brand';

/** Both email OTP and external-wallet proofs create a Privy identity; the
 * embedded wallet remains the member's trading wallet, as in the original. */
export function privyConfig(origin:string,bnb:boolean):PrivyClientConfig {
  const chain=bnb?bsc:robinhoodChain;
  return {
    loginMethods:['email','wallet'],
    appearance:{
      theme:'dark',accentColor:'#f0b90b',logo:BRAND_MARK,
      landingHeader:'Sign in to Clashr',
      showWalletLoginFirst:false,
      walletList:['metamask','detected_wallets','wallet_connect'],
      walletChainType:'ethereum-only',
    },
    embeddedWallets:{ethereum:{createOnLogin:'all-users'},showWalletUIs:false},
    legal:{termsAndConditionsUrl:`${origin}/terms`,privacyPolicyUrl:`${origin}/privacy`},
    defaultChain:chain,supportedChains:[chain],
  };
}
