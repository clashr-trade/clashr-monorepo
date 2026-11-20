'use client';

import { useEffect, useRef } from 'react';
import { PrivyProvider, useExportWallet, usePrivy, useSendTransaction, useSignTransaction, useWallets } from '@privy-io/react-auth';
import { robinhoodChain } from '@clashr/trade';
import {BNB_PRODUCT} from '@/lib/product';
import {privyConfig} from '@/lib/privy-config';
import {setBscEmbeddedProvider,type BscInjectedProvider} from '@/lib/bsc-wallet';
import { privyAppId, setAuthActions, setAuthState, type AuthUser } from '@/lib/auth';

/**
 * Privy, loaded lazily by AuthRoot. It wraps only a bridge component (never the page), so loading
 * it doesn't remount anything: the bridge copies Privy's state into lib/auth and exposes its actions.
 *
 * Sign-in: email OTP or an external EVM wallet. Every user gets an embedded wallet
 * at sign-up on the configured product chain. BNB trades retain individual confirmation.
 */
export default function PrivyHost() {
  return (
    <PrivyProvider
      appId={privyAppId()}
      config={privyConfig(window.location.origin,BNB_PRODUCT)}
    >
      <Bridge />
    </PrivyProvider>
  );
}

function Bridge() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { exportWallet } = useExportWallet();
  const { sendTransaction } = useSendTransaction();
  const { signTransaction } = useSignTransaction();

  const embedded = wallets.find((w) => w.walletClientType === 'privy');
  useEffect(()=>{
    if(!BNB_PRODUCT||!embedded)return;
    let active=true;
    void embedded.getEthereumProvider().then(provider=>{if(active)setBscEmbeddedProvider(provider as BscInjectedProvider);});
    return()=>{active=false;setBscEmbeddedProvider(null);};
  },[embedded]);

  // Warm the wallet as soon as it exists, so the first quick trade isn't cold: a fresh access token
  // (signing needs one) and the embedded wallet's provider. Nothing is signed.
  const warmed = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !authenticated || !embedded || warmed.current === embedded.address) return;
    warmed.current = embedded.address;
    void getAccessToken().catch(() => null);
    void embedded.getEthereumProvider().catch(() => null);
  }, [ready, authenticated, embedded, getAccessToken]);

  useEffect(() => {
    const u: AuthUser | null = user
      ? {
          id: user.id,
          email: user.email?.address ?? null,
          twitter: user.twitter?.username ? { username: user.twitter.username, avatar: user.twitter.profilePictureUrl ?? null } : null,
          wallet: ((embedded?.address ?? (user.wallet?.walletClientType === 'privy' ? user.wallet.address : null)) as `0x${string}` | null) ?? null,
          externalWallet: (wallets.find((w) => w.walletClientType !== 'privy')?.address as `0x${string}` | undefined) ?? null,
          walletKind:'embedded',
        }
      : null;
    setAuthState({ ready, authenticated, user: u });
  }, [ready, authenticated, user, embedded?.address, wallets]);

  useEffect(() => {
    setAuthActions({
      login,
      async logout() {
        // Do not revive a pre-Privy wallet session after the user signs out.
        if(BNB_PRODUCT){
          const response=await fetch('/api/product/v1/auth/wallet/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
          if(!response.ok)throw new Error('Could not end the wallet session. Try signing out again.');
        }
        await logout();
      },
      exportWallet: () => exportWallet(embedded ? { address: embedded.address } : undefined),
      async sendTransaction(tx) {
        if (!embedded) throw new Error('No embedded wallet yet');
        const { hash } = await sendTransaction(
          { to: tx.to, data: tx.data, value: tx.value, gasLimit: tx.gas, chainId: BNB_PRODUCT?56:robinhoodChain.id },
          { address: embedded.address, uiOptions: { showWalletUIs: BNB_PRODUCT } },
        );
        return hash;
      },
      // Quick trades: sign only, with every field given (Privy then fetches nothing), and broadcast
      // from the trade UI to the chain's RPC (components/trade/fast-send). Privy's UI stays off.
      async signTransaction(tx) {
        if (!embedded) throw new Error('No embedded wallet yet');
        const { signature } = await signTransaction(
          {
            type: 2,
            chainId: tx.chainId,
            nonce: tx.nonce,
            to: tx.to,
            data: tx.data,
            value: tx.value,
            gasLimit: tx.gas,
            maxFeePerGas: tx.maxFeePerGas,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
          },
          { address: embedded.address, uiOptions: { showWalletUIs: false } },
        );
        return signature;
      },
      getAccessToken,
    });
    return () => setAuthActions(null);
  }, [login, logout, exportWallet, sendTransaction, signTransaction, getAccessToken, embedded]);

  return null;
}
