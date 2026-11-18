'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPublicClient, formatUnits, type Address, type Hash, type Hex, type WalletClient } from 'viem';
import { bsc } from 'viem/chains';
import { ArrowSquareOut, CircleNotch, LockKey } from '@phosphor-icons/react';
import { BSC_ERC20_ABI, executeBscSpot, quoteBscSpot, simulateBscSpot, verifyBscReceipt, type BscSpotQuote, type BscSpotSimulation } from '@rushr/trade/bsc';
import { sanitizeRpcMessage } from '@rushr/trade/errors';
import {BNB_PRODUCT} from '@/lib/product';
import {auth} from '@/lib/auth';
import { rpcTransport } from '@/lib/rpc';
import { bnbAmountForUsd,bscSigningEnabled, bscWalletClient, bscWalletProvider, switchBscWalletChain, parseBscInput, parseBscSlippage, readBscActivity, saveBscActivity, type BscActivity, type BscInjectedProvider } from '@/lib/bsc-wallet';

export function BscSpotPanel({ token, symbol,presentation='review',initialAmount=presentation==='terminal'?'':'0.01',bnbUsd=null,initialSide='buy',venueAvailable=true }: { token: Address; symbol: string; initialAmount?:string;presentation?:'review'|'terminal';bnbUsd?:number|null;initialSide?:'buy'|'sell';venueAvailable?:boolean }) {
  const client = useMemo(() => createPublicClient({ chain: bsc, transport: rpcTransport(56) }), []);
  const [provider, setProvider] = useState<BscInjectedProvider | null>(null);
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chain, setChain] = useState<number | null>(null);
  const [side, setSide] = useState<'buy' | 'sell'>(initialSide);
  const [amount, setAmount] = useState(initialAmount);
  const [slippage, setSlippage] = useState('1');
  const [quote, setQuote] = useState<BscSpotQuote | null>(null);
  const [proof, setProof] = useState<BscSpotSimulation | null>(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [activity, setActivity] = useState<BscActivity[]>([]);
  const [dollars,setDollars]=useState('');
  const [balance,setBalance]=useState<{native:bigint;tokens:bigint;decimals:number}|null>(null);
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
    invalidate(); setAmount(initialAmount);setDollars('');
  }, [token,initialAmount]);
  useEffect(()=>{
    if(presentation!=='terminal'||side!=='buy'||!dollars||!bnbUsd||amount)return;
    try{setAmount(bnbAmountForUsd(dollars,bnbUsd));}catch{/* Invalid or incomplete input remains unquotable. */}
  },[presentation,side,dollars,bnbUsd,amount]);
  useEffect(()=>{
    setBalance(null);if(!account||chain!==56||presentation!=='terminal')return;
    let active=true;
    const run=async()=>{try{const [native,tokens,decimals]=await Promise.all([client.getBalance({address:account}),client.readContract({address:token,abi:BSC_ERC20_ABI,functionName:'balanceOf',args:[account]}),client.readContract({address:token,abi:BSC_ERC20_ABI,functionName:'decimals'})]);if(active)setBalance({native,tokens,decimals});}catch{/* Unknown balances are never shown as zero. */}};
    void run();const timer=setInterval(run,15_000);return()=>{active=false;clearInterval(timer);};
  },[account,chain,token,presentation,client]);
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
        if (mounted.current) { activeAccount.current = addresses[0] ?? null; setAccount(addresses[0] ?? null); setChain(id); setError('Wallet changed. Review a new quote.'); }
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
  const getQuote = () => run(async () => {
    if (!account || chain !== 56) throw new Error('Connect your wallet on BNB Smart Chain');
    invalidate(); const version = generation.current;
    if(!venueAvailable)throw new Error('Bonding-curve signing is not enabled. This token needs a verified PancakeSwap pool.');
    setStage('Verifying BSC venues and quoting PancakeSwap routes');
    const decimals = side === 'buy' ? 18 : await client.readContract({ address: token, abi: BSC_ERC20_ABI, functionName: 'decimals' });
    const quotes = await quoteBscSpot(client, { chainId: 56, side, token, trader: account, amountIn: parseBscInput(amount, decimals), slippageBps: parseBscSlippage(slippage) });
    if (side === 'sell' && quotes[0]!.tokenDecimals !== decimals) throw new Error('Token decimals changed; a fresh quote is required');
    if (mounted.current && generation.current === version) { setQuote(quotes[0]!); setProof(null); setStage(''); }
  });
  const simulate = () => run(async () => {
    if (!quote) return;
    const version = generation.current; setStage('Simulating exact approvals and wallet balance changes');
    const next = await simulateBscSpot(client, quote);
    if (mounted.current && generation.current === version) { setProof(next); setStage('Simulation passed'); }
  });
  const submit = () => run(async () => {
    if (!quote || !proof || !wallet || !account) return;
    operation.current = new AbortController();
    const execution = await executeBscSpot(client, wallet, quote, { enabled: signing, reviewedMaxGasCostWei: proof.maxGasCostWei, signal: operation.current.signal,
      onStage: next => { if (mounted.current) setStage(next); },
      onSubmitted: item => {
        const entry: BscActivity = { chainId: 56, account: account.toLowerCase(), token: token.toLowerCase(), hash: item.hash,
          kind: item.kind, status: 'submitted', createdAt: new Date().toISOString(),
          expected: { to: item.tx.to.toLowerCase(), data: item.tx.data, value: item.tx.value.toString() } };
        if (item.replaces) record({ ...entry, hash: item.replaces, status: 'replaced' });
        record(entry);
      },
    });
    if(BNB_PRODUCT&&auth.state.authenticated){
      try{const report=await fetch('/api/product/v1/trades',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({txHash:execution.hash,quote,approvals:execution.approvals},(_,v)=>typeof v==='bigint'?v.toString():v)});
        if(!report.ok)throw new Error();
      }catch{if(mounted.current)setError('Transaction mined. Platform receipt reporting is pending; your wallet-local receipt remains available.');}
    }
    for (const tx of execution.accounting.transactions) record({ chainId: 56, account: account.toLowerCase(), token: token.toLowerCase(), hash: tx.hash,
      kind: tx.hash === execution.hash ? 'swap' : 'approval', status: tx.status === 'reverted' ? 'reverted' : tx.finality,
      networkFeeWei: tx.feeWei.toString(), createdAt: new Date().toISOString(),
      fill: tx.hash === execution.hash ? { side: quote.request.side, tokenAmount: execution.accounting.actualTokenAmount.toString(),
        nativeAmount: execution.accounting.actualNativeAmount.toString(), tokenDecimals: quote.tokenDecimals,
        meetsMinimum: execution.accounting.meetsMinimum, provenance: 'canonical-receipt-events', platformFeeWei: '0' } : undefined });
    window.dispatchEvent(new CustomEvent('rushr:trade',{detail:{chainId:56,phase:'confirmed',wallet:account,token,hash:execution.hash,side:quote.request.side,amountIn:quote.request.amountIn.toString(),expectedOut:quote.amountOut.toString(),decimals:quote.tokenDecimals}}));
    if (mounted.current) { setQuote(null); setProof(null); setStage(execution.accounting.meetsMinimum ? 'Mined and reconciled. Finality is shown in activity.' : 'Execution did not meet the reviewed result. Inspect the receipt.'); }
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
  const setUsdBudget=(value:string)=>{
    invalidate();setDollars(value);
    try{setAmount(bnbAmountForUsd(value,bnbUsd??0));}catch{setAmount('');}
  };
  const maximum=()=>{
    if(!balance)return;invalidate();
    if(side==='sell'){setAmount(formatUnits(balance.tokens,balance.decimals));return;}
    const reserve=3_000_000_000_000_000n;
    const spend=balance.native>reserve?balance.native-reserve:0n;
    setAmount(spend?formatUnits(spend,18):'');setDollars(bnbUsd?(Number(formatUnits(spend,18))*bnbUsd).toFixed(2):'');
  };
  return <section className="rounded-2xl border border-white/[0.07] bg-surface p-4">
    <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">{(['buy', 'sell'] as const).map(value => <button key={value} disabled={busy} onClick={() => { invalidate(); setSide(value); setAmount('');setDollars(''); }} className={`rounded-lg py-2 text-sm font-semibold ${side === value ? presentation==='terminal'?(side==='buy'?'bg-go text-bg':'bg-risk-high text-bg'):'bg-brand/15 text-brand' : 'text-muted'}`}>{value === 'buy' ? 'Buy' : 'Sell'}</button>)}</div>
    {presentation==='terminal'&&<>
      <div className="my-5 flex items-center justify-center gap-1"><span className="text-4xl text-muted">{side==='buy'?'$':''}</span><input aria-label={side==='buy'?'Buy amount in USD':`Sell amount in ${symbol}`} inputMode="decimal" disabled={busy} value={side==='buy'?dollars:amount} placeholder="0" onChange={e=>{if(side==='buy')setUsdBudget(e.target.value);else{invalidate();setAmount(e.target.value);}}} className="min-w-0 w-40 bg-transparent text-center font-mono text-4xl outline-none placeholder:text-muted"/></div>
      <p className="mb-4 text-center text-xs text-muted">{side==='buy'?'Enter amount':symbol}</p>
      <div className="mb-4 grid grid-cols-4 gap-2">{(side==='buy'?[10,100,500,1000]:[25,50,75,100]).map(value=><button key={value} disabled={busy||(side==='buy'?!bnbUsd:!balance)} onClick={()=>{if(side==='buy')setUsdBudget(String(value));else if(balance){invalidate();setAmount(formatUnits(balance.tokens*BigInt(value)/100n,balance.decimals));}}} className="rounded-xl border border-white/10 py-2 font-mono text-xs disabled:opacity-40">{side==='buy'?`$${value}`:`${value}%`}</button>)}</div>
      <div className="mb-3 flex justify-between text-xs text-muted"><span>Balance {balance?side==='buy'?`${Number(formatUnits(balance.native,18)).toFixed(5)} BNB`:`${Number(formatUnits(balance.tokens,balance.decimals)).toLocaleString('en-US')} ${symbol}`:'—'}</span><button onClick={maximum} disabled={busy||!balance} title={side==='buy'?'Leaves 0.003 BNB for network fees; simulation checks the full budget.':undefined} className="font-semibold text-ink disabled:opacity-40">Max</button></div>
      {side==='buy'&&amount&&<p className="mb-3 break-all font-mono text-[10px] text-muted">Spend (BNB): {amount}. USD conversion is indicative.</p>}
    </>}
    {(!venueAvailable||presentation==='review')&&<p className="mb-4 text-[11px] leading-relaxed text-muted">{venueAvailable?'PancakeSwap v2 / v3 · BNB settlement · No platform fee. Quotes use verified on-chain state.':'Bonding-curve signing is not enabled. Trading becomes available through a verified PancakeSwap pool.'}</p>}
    {!account ? <button disabled={busy} onClick={connect} className="w-full rounded-xl border border-white/10 py-3 text-sm">Connect wallet for quote & simulation</button> : <>
      <div className="mb-4 flex items-center justify-between text-[11px] text-muted"><span className="font-mono">{account.slice(0, 6)}…{account.slice(-4)}</span><span>{chain === 56 ? 'BNB Smart Chain' : 'Wrong network'}</span></div>
      {chain !== 56 ? <button disabled={busy} onClick={switchChain} className="w-full rounded-xl border border-white/10 py-3 text-sm">Switch wallet to BNB Smart Chain</button> : <>
        {presentation==='review'&&<label className="mb-3 block text-xs text-muted">Spend ({side === 'buy' ? 'BNB' : symbol})<input aria-label="BSC swap input amount" inputMode="decimal" disabled={busy} value={amount} onChange={e => { invalidate(); setAmount(e.target.value); }} className="mt-1.5 w-full rounded-xl border border-white/10 bg-bg px-3 py-3 font-mono text-sm text-ink outline-none focus:border-brand/40" /></label>}
        <label className="mb-4 flex items-center justify-between text-xs text-muted">Slippage (%)<input aria-label="BSC slippage percent" inputMode="decimal" disabled={busy} value={slippage} onChange={e => { invalidate(); setSlippage(e.target.value); }} className="w-20 rounded-lg border border-white/10 bg-bg px-2 py-1.5 text-right font-mono text-ink outline-none" /></label>
        <button disabled={busy || !amount||!venueAvailable} onClick={getQuote} className={`w-full rounded-xl py-2.5 text-xs font-semibold disabled:opacity-50 ${presentation==='terminal'?'bg-go text-bg':'border border-white/10'}`}>{quote ? 'Refresh on-chain quote' : presentation==='terminal'?`Review ${side} ${symbol}`:'Get on-chain quote'}</button>
      </>}
    </>}
    {quote && <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4 text-[11px]">
      <Line label="Receive (estimated)" value={`${formatUnits(quote.amountOut, side === 'buy' ? quote.tokenDecimals : 18)} ${side === 'buy' ? symbol : 'BNB'}`} />
      <Line label="Minimum received" value={`${formatUnits(quote.minAmountOut, side === 'buy' ? quote.tokenDecimals : 18)} ${side === 'buy' ? symbol : 'BNB'}`} />
      <Line label="Route" value={`${quote.venue} ${quote.feeTier == null ? '' : `· ${quote.feeTier / 10_000}% pool fee`}`} />
      <Line label="Venue fee" value={quote.feeTier == null ? 'Included in router quote' : `${quote.feeTier / 10_000}% included in output`} />
      <Line label="Pool impact incl. fee" value={`${quote.priceImpactBps / 100}% (5% maximum)`} />
      <Line label="Quote block" value={quote.blockNumber.toString()} /><Line label="Expiry" value={expired ? 'Expired — refresh required' : `${Math.max(0, quote.expiresAt - now)} seconds`} />
      <Line label="Platform fee" value="0 BNB" />
      {proof && <><Line label="Max network budget" value={`${formatUnits(proof.maxGasCostWei, 18)} BNB`} /><Line label="Token approvals" value={String(proof.build.approvals.length)} /></>}
      <button disabled={busy || expired} onClick={simulate} className="mt-3 w-full rounded-xl border border-white/10 py-2.5 text-xs disabled:opacity-50">Simulate approvals & swap</button>
      <button disabled={!signing || !proof || busy || expired} onClick={submit} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand/15 py-3 text-xs font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50">{signing ? 'Review & confirm in wallet' : <><LockKey />Signing disabled for this deployment</>}</button>
      <a href={`https://bscscan.com/address/${quote.router}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between pt-2 font-mono text-muted">Router {quote.router.slice(0, 8)}…{quote.router.slice(-4)}<ArrowSquareOut /></a>
      {!!proof?.build.approvals.length && <p className="pt-2 text-[10px] leading-relaxed text-muted">Each approval needs a wallet confirmation. An exact allowance can remain if a later swap is cancelled or fails; revoke it in your wallet if you will not continue.</p>}
    </div>}
    {stage && <p role="status" className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted">{busy && <CircleNotch className="shrink-0 animate-spin" size={14} />}{stage}</p>}
    {error && <p role="alert" className="mt-4 break-words text-[11px] leading-relaxed text-risk-high">{error}</p>}
    {busy && <button onClick={() => { generation.current++; operation.current?.abort(); setStage('Cancel requested; already submitted transactions still need receipt checks.'); }} className="mt-3 text-[11px] text-muted underline">Stop after the current wallet request</button>}
    {!signing && <p className="mt-4 text-[10px] leading-relaxed text-muted">Quote and simulation previews do not enable transaction signing. BSC execution remains off until explicitly enabled after rehearsal.</p>}
    {!!activity.length && <div className="mt-5 border-t border-white/[0.07] pt-4">
      <h3 className="text-xs font-medium">This wallet’s local BSC activity</h3>
      {activity.filter(row => row.token === token.toLowerCase()).slice(0, 5).map(row => <ActivityRow key={row.hash} row={row} symbol={symbol}/>)}
      <button disabled={busy} onClick={recoverReceipts} className="mt-3 text-[10px] underline">Recheck pending receipts</button>
      <p className="mt-3 text-[10px] text-muted">Browser-local receipt history; not platform PnL or a finalized balance.</p>
    </div>}
  </section>;
}
function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="shrink-0 text-muted">{label}</span><span className="break-all text-right font-mono">{value}</span></div>;
}
function ActivityRow({row,symbol}:{row:BscActivity;symbol:string}) {
  return <div className="mt-3 space-y-1 border-b border-white/[0.05] pb-3 text-[10px] text-muted">
    <a href={`https://bscscan.com/tx/${row.hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">{row.kind} · {row.status} · {row.hash.slice(0,8)}…<ArrowSquareOut size={11}/></a>
    {row.fill && row.status!=='reverted' && <p className="break-all font-mono">{row.fill.side==='buy'?'Bought':'Sold'} {formatUnits(BigInt(row.fill.tokenAmount),row.fill.tokenDecimals)} {symbol} / {formatUnits(BigInt(row.fill.nativeAmount),18)} BNB</p>}
    {row.networkFeeWei && <p className="break-all font-mono">Network fee: {formatUnits(BigInt(row.networkFeeWei),18)} BNB</p>}
    {row.fill && !row.fill.meetsMinimum && row.status!=='reverted' && <p className="text-risk-high">Minimum-output discrepancy: inspect the receipt.</p>}
  </div>;
}
