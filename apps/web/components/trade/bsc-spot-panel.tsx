'use client';

import { TRADE_EVENT } from '@/lib/brand-compat';
import {usePlatformLanguage} from '@/components/landing/language-provider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPublicClient, formatUnits, zeroAddress, type Address, type Hash, type Hex, type WalletClient } from 'viem';
import { bsc } from 'viem/chains';
import { ArrowSquareOut, CircleNotch } from '@phosphor-icons/react';
import { BSC_ERC20_ABI, executeBscSpot, quoteBscSpot, simulateBscSpot, verifyBscReceipt, type BscSpotQuote, type BscSpotSimulation } from '@clashr/trade/bsc';
import {flapAssetInfo,quoteFlap,simulateFlap,executeFlap,type FlapQuote,type FlapSimulation} from '@clashr/trade/bsc';
import { sanitizeRpcMessage } from '@clashr/trade/errors';
import {BNB_PRODUCT} from '@/lib/product';
import {auth} from '@/lib/auth';
import { runBscTrade } from '@/lib/bsc-trade-flow';
import { rpcTransport } from '@/lib/rpc';
import { assetAmountForUsd,bscSigningEnabled, bscWalletClient, bscWalletProvider, switchBscWalletChain, parseBscInput, parseBscSlippage, readBscActivity, saveBscActivity, type BscActivity, type BscInjectedProvider } from '@/lib/bsc-wallet';

export function BscSpotPanel({ token, symbol,presentation='review',initialAmount=presentation==='terminal'?'':'0.01',bnbUsd=null,quoteUsd=null,initialUsd=null,initialSide='buy',venueAvailable=true,venue='pancake' }: { token: Address; symbol: string; initialAmount?:string;presentation?:'review'|'terminal';bnbUsd?:number|null;quoteUsd?:number|null;initialUsd?:number|null;initialSide?:'buy'|'sell';venueAvailable?:boolean;venue?:'pancake'|'flap' }) {
  const {t:translateUI}=usePlatformLanguage();
  const client = useMemo(() => createPublicClient({ chain: bsc, transport: rpcTransport(56) }), []);
  const [provider, setProvider] = useState<BscInjectedProvider | null>(null);
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chain, setChain] = useState<number | null>(null);
  const [side, setSide] = useState<'buy' | 'sell'>(initialSide);
  const [amount, setAmount] = useState(initialAmount);
  const [slippage, setSlippage] = useState('1');
  const [quote, setQuote] = useState<BscSpotQuote|FlapQuote|null>(null);
  const [proof, setProof] = useState<BscSpotSimulation|FlapSimulation|null>(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [activity, setActivity] = useState<BscActivity[]>([]);
  const [dollars,setDollars]=useState(initialUsd?String(initialUsd):'');
  const [payment,setPayment]=useState<'native'|'quote'>('native');
  const [assetInfo,setAssetInfo]=useState<Awaited<ReturnType<typeof flapAssetInfo>>|null>(null);
  const [assetUsd,setAssetUsd]=useState<number|null>(quoteUsd);
  const payNative=payment==='native'||!assetInfo||assetInfo.quoteToken===zeroAddress;
  const inputSymbol=payNative?'BNB':assetInfo!.symbol,inputDecimals=payNative?18:assetInfo!.decimals;
  const inputUsd=payNative?bnbUsd:assetUsd;
  const [balance,setBalance]=useState<{native:bigint;tokens:bigint;decimals:number;quote:bigint|null}|null>(null);
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  const operation = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const mounted = useRef(false);
  const activeAccount = useRef<Address | null>(null);
  const signing = bscSigningEnabled();

  const invalidate = () => {
    generation.current++; operation.current?.abort(); setQuote(null); setProof(null); setError('');
  };
  useEffect(() => {
    mounted.current = true;
    setNow(Math.floor(Date.now() / 1000));
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => { mounted.current = false; generation.current++; operation.current?.abort(); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    invalidate(); setAmount(initialAmount);setDollars(initialUsd?String(initialUsd):'');
  }, [token,initialAmount]);
  useEffect(()=>{setAssetUsd(quoteUsd);},[quoteUsd]);
  useEffect(()=>{
    let active=true;setAssetInfo(null);setPayment('native');
    if(venue!=='flap')return;
    void flapAssetInfo(client,token).then(async info=>{
      if(!active)return;setAssetInfo(info);
      if(info.quoteToken!==zeroAddress&&!info.nativeToQuoteSwapEnabled){invalidate();setPayment('quote');setAmount('');}
      if(info.quoteToken!==zeroAddress&&!quoteUsd){try{const r=await fetch(`/api/bsc/public-token/${token}/snapshot`,{cache:'no-store'});if(r.ok){const body=await r.json() as {chainId?:number;detail?:{token?:{address?:string;quote_usd?:number|null}}};if(active&&body.chainId===56&&body.detail?.token?.address===token.toLowerCase())setAssetUsd(body.detail.token.quote_usd??null);}}catch{/* Raw quote-asset input remains available without USD conversion. */}}
    }).catch(e=>{if(active)setError(sanitizeRpcMessage(e));});
    return()=>{active=false;};
  },[client,token,venue]);
  useEffect(()=>{
    if(side!=='buy'||!dollars||!inputUsd||amount)return;
    try{setAmount(assetAmountForUsd(dollars,inputUsd,inputDecimals));}catch{/* Invalid or incomplete input remains unquotable. */}
  },[side,dollars,inputUsd,inputDecimals,amount]);
  useEffect(()=>{
    setBalance(null);if(!account||chain!==56||presentation!=='terminal')return;
    let active=true;
    const run=async()=>{try{const [native,tokens,decimals]=await Promise.all([client.getBalance({address:account}),client.readContract({address:token,abi:BSC_ERC20_ABI,functionName:'balanceOf',args:[account]}),client.readContract({address:token,abi:BSC_ERC20_ABI,functionName:'decimals'})]);const quote=assetInfo&&assetInfo.quoteToken!==zeroAddress?await client.readContract({address:assetInfo.quoteToken,abi:BSC_ERC20_ABI,functionName:'balanceOf',args:[account]}):null;if(active)setBalance({native,tokens,decimals,quote});}catch{/* Unknown balances are never shown as zero. */}};
    void run();const timer=setInterval(run,15_000);return()=>{active=false;clearInterval(timer);};
  },[account,chain,token,presentation,client,assetInfo,balanceRefresh]);
  useEffect(()=>{
    const injected=bscWalletProvider();if(!injected)return;
    const connection=bscWalletClient(injected);let active=true;
    void Promise.all([connection.getAddresses(),connection.getChainId()]).then(([addresses,network])=>{
      if(active&&addresses[0]){activeAccount.current=addresses[0];setProvider(injected);setWallet(connection);setAccount(addresses[0]);setChain(network);}
    }).catch(()=>undefined);
    return()=>{active=false;};
  },[]);
  useEffect(() => {
    activeAccount.current = account;
    try { setActivity(account ? readBscActivity(localStorage, account) : []); }
    catch { setActivity([]); setError('Browser storage is unavailable; keep submitted transaction links in your wallet.'); }
  }, [account]);
  useEffect(() => {
    if (!provider || !wallet) return;
    const changed = () => {
      activeAccount.current = null;
      invalidate();
      void Promise.all([wallet.getAddresses(), wallet.getChainId()]).then(([addresses, id]) => {
        if (mounted.current) { activeAccount.current = addresses[0] ?? null; setAccount(addresses[0] ?? null); setChain(id); setError('Wallet changed. Start a new trade.'); }
      }).catch(() => { if (mounted.current) { setAccount(null); setChain(null); } });
    };
    provider.on?.('accountsChanged', changed); provider.on?.('chainChanged', changed); provider.on?.('disconnect', changed);
    return () => { provider.removeListener?.('accountsChanged', changed); provider.removeListener?.('chainChanged', changed); provider.removeListener?.('disconnect', changed); };
  }, [provider, wallet]);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) { if (mounted.current) { setError(sanitizeRpcMessage(cause)); setStage(''); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  const record = (item: BscActivity) => {
    const current = () => mounted.current && activeAccount.current?.toLowerCase() === item.account;
    try { const rows = saveBscActivity(localStorage, item.account, item); if (current()) setActivity(rows); }
    catch { if (current()) {
      setActivity(rows => [{ ...rows.find(row => row.hash === item.hash), ...item }, ...rows.filter(row => row.hash !== item.hash)].slice(0, 50));
      setError('Activity is held in memory only because browser storage is unavailable. Keep the transaction link.');
    } }
  };
  const connect = () => run(async () => {
    const injected = bscWalletProvider();
    if (!injected) throw new Error('Install or open an EVM wallet browser to connect');
    const connection = bscWalletClient(injected);
    const addresses = await connection.requestAddresses();
    const network = await connection.getChainId();
    if (!addresses[0]) throw new Error('Wallet did not expose a signing account');
    invalidate(); activeAccount.current = addresses[0]; setProvider(injected); setWallet(connection); setAccount(addresses[0]); setChain(network);
  });
  const switchChain = () => run(async () => {
    if (!provider || !wallet) return;
    await switchBscWalletChain(provider);
    setChain(await wallet.getChainId()); invalidate();
  });
  async function requestQuote(version: number): Promise<BscSpotQuote | FlapQuote> {
    if (!account || chain !== 56) throw new Error('Connect your wallet on BNB Smart Chain');
    if(!venueAvailable)throw new Error('No supported trading venue is available for this token.');
    if(venue==='flap'&&!assetInfo)throw new Error('Wait for the curve payment asset to load before requesting a quote.');
    setStage(venue === 'flap' ? 'Verifying Flap Portal and quoting the bonding curve' : 'Verifying BSC venues and quoting PancakeSwap routes');
    const decimals = side === 'buy' ? inputDecimals : await client.readContract({ address: token, abi: BSC_ERC20_ABI, functionName: 'decimals' });
    const request = { chainId: 56, side, token, trader: account, amountIn: parseBscInput(amount, decimals), slippageBps: parseBscSlippage(slippage) } as const;
    const quotes = venue==='flap'?[await quoteFlap(client,{...request,payment})]:await quoteBscSpot(client, request);
    const first=quotes[0];
    if (!first) throw new Error('No supported trading route is available for this token.');
    if(first.venue==='flap'&&assetInfo&&(first.quoteToken.toLowerCase()!==assetInfo.quoteToken.toLowerCase()||first.quoteDecimals!==assetInfo.decimals)){setAssetInfo(await flapAssetInfo(client,token));setAmount('');setDollars('');throw new Error('Curve settlement changed. Review the asset and amount again.');}
    if (side === 'sell' && quotes[0]!.tokenDecimals !== decimals) throw new Error('Token decimals changed; a fresh quote is required');
    if (!mounted.current || generation.current !== version) throw new Error('Trade changed before the quote completed.');
    setQuote(first); setProof(null); setStage('');
    return first;
  }
  async function executeQuote(quote: BscSpotQuote | FlapQuote, proof: BscSpotSimulation | FlapSimulation, version: number) {
    if (!wallet || !account) throw new Error('Connect your wallet on BNB Smart Chain');
    const options = { enabled: signing, reviewedMaxGasCostWei: proof.maxGasCostWei, signal: operation.current?.signal,
      onStage: (next: string) => { if (mounted.current) setStage(next); },
      onSubmitted: (item: {kind:'approval'|'swap';hash:Hash;tx:import('@clashr/trade/bsc').BscTransaction;replaces?:Hash}) => {
        const entry: BscActivity = { chainId: 56, account: account.toLowerCase(), token: token.toLowerCase(), hash: item.hash,
          kind: item.kind, status: 'submitted', createdAt: new Date().toISOString(),
          expected: { to: item.tx.to.toLowerCase(), data: item.tx.data, value: item.tx.value.toString() } };
        if (item.replaces) record({ ...entry, hash: item.replaces, status: 'replaced' });
        record(entry);
      },
    };
    const execution = await (quote.venue==='flap'?executeFlap(client,wallet,quote,options):executeBscSpot(client, wallet, quote, options));
    if(quote.venue!=='flap'&&BNB_PRODUCT&&auth.state.authenticated){
      try{const report=await fetch('/api/product/v1/trades',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({txHash:execution.hash,quote,approvals:execution.approvals},(_,v)=>typeof v==='bigint'?v.toString():v)});
        if(!report.ok)throw new Error();
      }catch{if(mounted.current)setError('Transaction mined. Platform receipt reporting is pending; your wallet-local receipt remains available.');}
    }
    for (const tx of execution.accounting.transactions) record({ chainId: 56, account: account.toLowerCase(), token: token.toLowerCase(), hash: tx.hash,
      kind: tx.hash === execution.hash ? 'swap' : 'approval', status: tx.status === 'reverted' ? 'reverted' : tx.finality,
      networkFeeWei: tx.feeWei.toString(), createdAt: new Date().toISOString(),
      fill: tx.hash === execution.hash ? { side: quote.request.side, tokenAmount: execution.accounting.actualTokenAmount.toString(),
        nativeAmount: execution.accounting.actualNativeAmount?.toString()??null, tokenDecimals: quote.tokenDecimals,
        ...('settlementAsset' in execution.accounting?{settlement:{asset:execution.accounting.settlementAsset,amount:execution.accounting.actualSettlementAmount?.toString()??null,maximum:execution.accounting.maximumInputAmount.toString(),decimals:execution.accounting.settlementDecimals,symbol:execution.accounting.settlementSymbol}}:{}),
        meetsMinimum: execution.accounting.meetsMinimum, provenance: 'canonical-receipt-events', platformFeeWei: '0' } : undefined });
    window.dispatchEvent(new CustomEvent(TRADE_EVENT,{detail:{chainId:56,phase:'confirmed',wallet:account,token,hash:execution.hash,side:quote.request.side,amountIn:quote.request.amountIn.toString(),expectedOut:quote.amountOut.toString(),decimals:quote.tokenDecimals}}));
    if (mounted.current && generation.current === version) { setQuote(null); setProof(null); setBalanceRefresh(value => value + 1); setStage(execution.accounting.meetsMinimum ? 'Mined and reconciled. Finality is shown in activity.' : 'Execution did not meet the requested minimum. Inspect the receipt.'); }
  }
  const trade = () => run(async () => {
    if (activity.some(row => row.token === token.toLowerCase() && row.status === 'submitted'))
      throw new Error('A transaction is still pending. Recheck its receipt before trading again.');
    invalidate();
    const version = generation.current;
    const controller = new AbortController();
    operation.current = controller;
    const assertCurrent = () => {
      if (!mounted.current || controller.signal.aborted || generation.current !== version)
        throw new Error('Trade cancelled. No further wallet confirmation will be requested.');
    };
    try {
      await runBscTrade<BscSpotQuote | FlapQuote, BscSpotSimulation | FlapSimulation, void>({
        enabled: signing, assertCurrent, quote: () => requestQuote(version),
        simulate: async current => {
          setStage('Checking balances, approvals and swap simulation');
          const result = await (current.venue === 'flap' ? simulateFlap(client, current) : simulateBscSpot(client, current));
          assertCurrent(); setProof(result); return result;
        },
        execute: (current, simulation) => executeQuote(current, simulation, version),
      });
    } finally {
      if (operation.current === controller) operation.current = null;
    }
  });
  const recoverReceipts = () => run(async () => {
    if (!account) return;
    const version = generation.current;
    const rows = activity.filter(row => row.token === token.toLowerCase() && ['submitted', 'mined'].includes(row.status) && row.expected).slice(0, 5);
    let unavailable = 0;
    for (const row of rows) {
      try {
        const result = await verifyBscReceipt(client, { chainId: 56, account, to: row.expected!.to as Address, data: row.expected!.data as Hex, value: BigInt(row.expected!.value) }, row.hash as Hash);
        if (version !== generation.current) return;
        record({ ...row, status: result.receipt.status === 'reverted' ? 'reverted' : result.gas.finality, networkFeeWei: result.gas.feeWei.toString() });
      } catch { unavailable++; }
    }
    if (mounted.current) setStage(unavailable ? 'Some receipts are pending or could not be verified. Check the wallet/explorer.' : 'Canonical receipt statuses refreshed.');
  });

  const expired = quote ? now >= quote.expiresAt : false;
  const hasAmount = /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(amount) && /[1-9]/.test(amount);
  const pending = activity.some(row => row.token === token.toLowerCase() && row.status === 'submitted');
  const setUsdBudget=(value:string)=>{
    invalidate();setDollars(value);
    try{setAmount(assetAmountForUsd(value,inputUsd??0,inputDecimals));}catch{setAmount('');}
  };
  const maximum=()=>{
    if(!balance)return;invalidate();
    if(side==='sell'){setAmount(formatUnits(balance.tokens,balance.decimals));return;}
    const reserve=3_000_000_000_000_000n;
    const spend=payNative?(balance.native>reserve?balance.native-reserve:0n):(balance.quote??0n);
    setAmount(spend?formatUnits(spend,inputDecimals):'');setDollars(inputUsd?(Number(formatUnits(spend,inputDecimals))*inputUsd).toFixed(2):'');
  };
  return <section className="rounded-2xl border border-white/[0.07] bg-surface p-4">
    <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">{(['buy', 'sell'] as const).map(value => <button key={value} disabled={busy} onClick={() => { invalidate(); setSide(value); setAmount('');setDollars(''); }} className={`rounded-lg py-2 text-sm font-semibold ${side === value ? presentation==='terminal'?(side==='buy'?'bg-go text-bg':'bg-risk-high text-bg'):'bg-brand/15 text-brand' : 'text-muted'}`}>{value === 'buy' ? translateUI("Buy") : translateUI("Sell")}</button>)}</div>
    {venue==='flap'&&assetInfo&&assetInfo.quoteToken!==zeroAddress&&(side==='buy'?<label className="mb-3 flex items-center justify-between gap-2 text-xs text-muted">{translateUI('Pay with')}<select aria-label={translateUI('Payment asset')} disabled={busy} value={payment} onChange={e=>{invalidate();setPayment(e.target.value as 'native'|'quote');setAmount('');}} className="rounded-lg border border-white/10 bg-bg px-2 py-1.5 text-ink"><option value="native" disabled={!assetInfo.nativeToQuoteSwapEnabled}>BNB</option><option value="quote">{assetInfo.symbol}</option></select></label>:<p className="mb-3 text-xs text-muted">{translateUI('Receive')} {assetInfo.symbol} · {translateUI('Network fees in BNB')}</p>)}
    {presentation==='terminal'&&<>
      <div className="my-5 flex items-center justify-center gap-1"><span className="text-4xl text-muted">{side==='buy'?'$':''}</span><input aria-label={side==='buy'?translateUI("Buy amount in USD"):`Sell amount in ${symbol}`} inputMode="decimal" disabled={busy} value={side==='buy'?dollars:amount} placeholder="0" onChange={e=>{if(side==='buy')setUsdBudget(e.target.value);else{invalidate();setAmount(e.target.value);}}} className="min-w-0 w-40 bg-transparent text-center font-mono text-4xl outline-none placeholder:text-muted"/></div>
      <p className="mb-4 text-center text-xs text-muted">{side==='buy'?translateUI("Enter amount"):symbol}</p>
      <div className="mb-4 grid grid-cols-4 gap-2">{(side==='buy'?[10,100,500,1000]:[25,50,75,100]).map(value=><button key={value} disabled={busy||(side==='buy'?!inputUsd:!balance)} onClick={()=>{if(side==='buy')setUsdBudget(String(value));else if(balance){invalidate();setAmount(formatUnits(balance.tokens*BigInt(value)/100n,balance.decimals));}}} className="rounded-xl border border-white/10 py-2 font-mono text-xs disabled:opacity-40">{side==='buy'?`$${value}`:`${value}%`}</button>)}</div>
      <div className="mb-3 flex justify-between text-xs text-muted"><span>{translateUI("Balance")} {balance?side==='buy'?`${Number(formatUnits(payNative?balance.native:balance.quote??0n,inputDecimals)).toFixed(5)} ${inputSymbol}`:`${Number(formatUnits(balance.tokens,balance.decimals)).toLocaleString('en-US')} ${symbol}`:'—'}</span><button onClick={maximum} disabled={busy||!balance} title={side==='buy'?translateUI("Leaves 0.003 BNB for network fees; simulation checks the full budget."):undefined} className="font-semibold text-ink disabled:opacity-40">{translateUI("Max")}</button></div>
      {balance?.native === 0n && <p className="mb-3 text-[11px] text-risk-medium">{translateUI('Add BNB to this wallet for network fees.')}</p>}
      {side === 'buy' && !inputUsd && <p className="mb-3 text-[11px] text-muted">{translateUI('USD price unavailable. Enter the payment asset amount below.')}</p>}
      {side==='buy'&&<label className="mb-3 block text-xs text-muted">{translateUI('Spend')} ({inputSymbol})<input aria-label={translateUI('BSC swap input amount')} inputMode="decimal" disabled={busy} value={amount} onChange={e=>{invalidate();setAmount(e.target.value);setDollars('');}} className="mt-1.5 w-full rounded-xl border border-white/10 bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brand/40"/>{dollars&&<span className="mt-1 block text-[10px]">{translateUI('USD conversion is indicative.')}</span>}</label>}
    </>}
    {(!venueAvailable||presentation==='review'||venue==='flap')&&<p className="mb-4 text-[11px] leading-relaxed text-muted">{venueAvailable?venue==='flap'?`${translateUI('Flap bonding curve')} · ${side==='buy'?inputSymbol:assetInfo?.symbol??'BNB'} · ${translateUI('Network fees in BNB')}`:translateUI("PancakeSwap v2 / v3 · BNB settlement · No platform fee. Quotes use verified on-chain state."):translateUI("This token has no supported Flap curve or PancakeSwap v2/v3 pool.")}</p>}
    {!account ? <button disabled={busy} onClick={connect} className="w-full rounded-xl border border-white/10 py-3 text-sm">{translateUI("Connect wallet to trade")}</button> : <>
      <div className="mb-4 flex items-center justify-between text-[11px] text-muted"><span className="font-mono">{account.slice(0, 6)}…{account.slice(-4)}</span><span>{chain === 56 ? translateUI("BNB Smart Chain") : translateUI("Wrong network")}</span></div>
      {chain !== 56 ? <button disabled={busy} onClick={switchChain} className="w-full rounded-xl border border-white/10 py-3 text-sm">{translateUI("Switch wallet to BNB Smart Chain")}</button> : <>
        {presentation==='review'&&<label className="mb-3 block text-xs text-muted">{translateUI("Spend (")}{side === 'buy' ? inputSymbol : symbol})<input aria-label={translateUI("BSC swap input amount")} inputMode="decimal" disabled={busy} value={amount} onChange={e => { invalidate(); setAmount(e.target.value); setDollars(''); }} className="mt-1.5 w-full rounded-xl border border-white/10 bg-bg px-3 py-3 font-mono text-sm text-ink outline-none focus:border-brand/40" /></label>}
        <label className="mb-4 flex items-center justify-between text-xs text-muted">{translateUI("Slippage (%)")}<input aria-label={translateUI("BSC slippage percent")} inputMode="decimal" disabled={busy} value={slippage} onChange={e => { invalidate(); setSlippage(e.target.value); }} className="w-20 rounded-lg border border-white/10 bg-bg px-2 py-1.5 text-right font-mono text-ink outline-none" /></label>
        <button
          disabled={busy || !hasAmount || !venueAvailable || !signing || pending}
          onClick={trade}
          title={!hasAmount ? translateUI('Enter an amount to trade') : pending ? translateUI('Recheck the pending receipt before trading again') : undefined}
          className={`w-full rounded-xl py-2.5 text-xs font-semibold disabled:opacity-50 ${presentation==='terminal'?(side==='buy'?'bg-go text-bg':'bg-risk-high text-bg'):'border border-white/10'}`}
        >{busy ? translateUI('Processing trade…') : `${translateUI(side === 'buy' ? 'Buy' : 'Sell')} ${symbol}`}</button>
      </>}
    </>}
    {quote && <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4 text-[11px]">
      <Line label={translateUI("Receive (estimated)")} value={`${formatUnits(quote.amountOut, side === 'buy' ? quote.tokenDecimals : quote.venue==='flap'?quote.quoteDecimals:18)} ${side === 'buy' ? symbol : quote.venue==='flap'?quote.quoteSymbol:'BNB'}`} />
      <Line label={translateUI("Minimum received")} value={`${formatUnits(quote.minAmountOut, side === 'buy' ? quote.tokenDecimals : quote.venue==='flap'?quote.quoteDecimals:18)} ${side === 'buy' ? symbol : quote.venue==='flap'?quote.quoteSymbol:'BNB'}`} />
      <Line label={translateUI("Route")} value={`${quote.venue} ${quote.feeTier == null ? '' : `· ${quote.feeTier / 10_000}% pool fee`}`} />
      <Line label={translateUI("Venue fee")} value={quote.feeTier == null ? 'Included in router quote' : `${quote.feeTier / 10_000}% included in output`} />
      {quote.priceImpactBps !== null && <Line label={translateUI("Pool impact incl. fee")} value={`${quote.priceImpactBps / 100}% (5% maximum)`} />}
      <Line label={translateUI("Quote block")} value={quote.blockNumber.toString()} /><Line label={translateUI("Expiry")} value={expired ? 'Expired — refresh required' : `${Math.max(0, quote.expiresAt - now)} seconds`} />
      <Line label={translateUI("Platform fee")} value="0 BNB" />
      {proof && <><Line label={translateUI("Max network budget")} value={`${formatUnits(proof.maxGasCostWei, 18)} BNB`} /><Line label={translateUI("Token approvals")} value={String(proof.build.approvals.length)} /></>}
      <a href={`https://bscscan.com/address/${quote.router}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between pt-2 font-mono text-muted">{translateUI("Router")} {quote.router.slice(0, 8)}…{quote.router.slice(-4)}<ArrowSquareOut /></a>
      {!!proof?.build.approvals.length && <p className="pt-2 text-[10px] leading-relaxed text-muted">{translateUI("Each approval needs a wallet confirmation. An exact allowance can remain if a later swap is cancelled or fails; revoke it in your wallet if you will not continue.")}</p>}
    </div>}
    {account && chain === 56 && <p className="mt-3 text-[10px] leading-relaxed text-muted">{translateUI('Confirm approvals and the swap in your wallet.')}</p>}
    {pending && !busy && <p role="status" className="mt-3 text-[11px] text-muted">{translateUI('Recheck the pending receipt before trading again')}</p>}
    {stage && <p role="status" className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted">{busy && <CircleNotch className="shrink-0 animate-spin" size={14} />}{stage}</p>}
    {error && <p role="alert" className="mt-4 break-words text-[11px] leading-relaxed text-risk-high">{error}</p>}
    {busy && <button onClick={() => { generation.current++; operation.current?.abort(); setStage('Cancel requested; already submitted transactions still need receipt checks.'); }} className="mt-3 text-[11px] text-muted underline">{translateUI("Stop after the current wallet request")}</button>}
    {!signing && <p className="mt-4 text-[10px] leading-relaxed text-muted">{translateUI("Quote and simulation previews do not enable transaction signing. BSC execution remains off until explicitly enabled after rehearsal.")}</p>}
    {!!activity.length && <div className="mt-5 border-t border-white/[0.07] pt-4">
      <h3 className="text-xs font-medium">{translateUI("This wallet’s local BSC activity")}</h3>
      {activity.filter(row => row.token === token.toLowerCase()).slice(0, 5).map(row => <ActivityRow key={row.hash} row={row} symbol={symbol}/>)}
      <button disabled={busy} onClick={recoverReceipts} className="mt-3 text-[10px] underline">{translateUI("Recheck pending receipts")}</button>
      <p className="mt-3 text-[10px] text-muted">{translateUI("Browser-local receipt history; not platform PnL or a finalized balance.")}</p>
    </div>}
  </section>;
}
function Line({ label, value }: { label: string; value: string }) {
  const {t:translateUI}=usePlatformLanguage();
  return <div className="flex justify-between gap-3"><span className="shrink-0 text-muted">{translateUI(label)}</span><span className="break-all text-right font-mono">{value}</span></div>;
}
function ActivityRow({row,symbol}:{row:BscActivity;symbol:string}) {
  const {t:translateUI}=usePlatformLanguage();
  return <div className="mt-3 space-y-1 border-b border-white/[0.05] pb-3 text-[10px] text-muted">
    <a href={`https://bscscan.com/tx/${row.hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">{row.kind} · {row.status} · {row.hash.slice(0,8)}…<ArrowSquareOut size={11}/></a>
    {row.fill && row.status!=='reverted' && <p className="break-all font-mono">{row.fill.side==='buy'?translateUI("Bought"):translateUI("Sold")} {formatUnits(BigInt(row.fill.tokenAmount),row.fill.tokenDecimals)} {symbol} / {row.fill.settlement ? `${row.fill.settlement.amount===null?translateUI('Up to')+' ':''}${formatUnits(BigInt(row.fill.settlement.amount??row.fill.settlement.maximum),row.fill.settlement.decimals)} ${row.fill.settlement.symbol}` : row.fill.nativeAmount!==null?`${formatUnits(BigInt(row.fill.nativeAmount),18)} BNB`:translateUI('Native spend unverified')}</p>}
    {row.networkFeeWei && <p className="break-all font-mono">{translateUI("Network fee:")} {formatUnits(BigInt(row.networkFeeWei),18)}  {translateUI("BNB")}</p>}
    {row.fill && !row.fill.meetsMinimum && row.status!=='reverted' && <p className="text-risk-high">{translateUI("Minimum-output discrepancy: inspect the receipt.")}</p>}
  </div>;
}
