import type {Sql} from 'postgres';
import {createPublicClient,erc20Abi,http,type Address} from 'viem';
import {bsc} from 'viem/chains';
import {BSC_PUBLIC_RPC} from '@rushr/core/chain/bsc-rpc';

export async function syncProductMarket(sql:Sql,origin:string,rpcUrl=BSC_PUBLIC_RPC){
  const response=await fetch(`${origin}/api/bsc/market`,{signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new Error('BNB market source unavailable');
  const market=await response.json() as {chainId:number;source:string;tokens:Record<string,unknown>[]};
  if(market.chainId!==56||!['fourmeme','geckoterminal'].includes(market.source)||!Array.isArray(market.tokens))throw new Error('Wrong market source');
  const client=createPublicClient({chain:bsc,transport:http(rpcUrl)});
  if(await client.getChainId()!==56)throw new Error('Wrong provider chain');
  const groups=['new','almost','migrated'].map(column=>market.tokens.filter(token=>token.market_column===column));
  const fair=Array.from({length:60},(_,index)=>groups.flatMap(group=>group[index]?[group[index]!]:[])).flat().slice(0,150);
  if(!fair.length)return {chainId:56,updated:0,source:market.source,metadataOnly:true};
  const knownRows=await sql`select address,decimals,total_supply from tokens where address in ${sql(fair.map(t=>String(t.address)))}`;
  const knownByAddress=new Map(knownRows.map(row=>[row.address,row]));
  const missing=fair.filter(token=>!knownByAddress.has(token.address)).slice(0,30);
  const metadata=await client.multicall({allowFailure:true,contracts:missing.flatMap(token=>[
    {address:token.address as Address,abi:erc20Abi,functionName:'decimals' as const},
    {address:token.address as Address,abi:erc20Abi,functionName:'totalSupply' as const},
  ])});
  missing.forEach((token,index)=>{const decimals=metadata[index*2],supply=metadata[index*2+1];if(decimals?.status==='success'&&supply?.status==='success')knownByAddress.set(token.address,{address:token.address,decimals:decimals.result,total_supply:supply.result});});
  let updated=0;
  for(const token of fair){
    if(typeof token.address!=='string'||!/^0x[0-9a-f]{40}$/.test(token.address)||token.chain_id!==56)continue;
    const known=knownByAddress.get(token.address);if(!known)continue;
    const decimals=known.decimals,supply=known.total_supply;
    if(!Number.isInteger(decimals)||decimals<0||decimals>36)continue;
    await sql`insert into tokens(address,name,symbol,decimals,total_supply,deployer,created_block,created_at,status,launchpad,image_url,price_usd,market_cap_usd,volume_24h_usd,liquidity_usd,bonding_progress,holders,quote)
      values(${token.address},${String(token.name).slice(0,200)},${String(token.symbol).slice(0,50)},${decimals},${String(supply)},${'0x0000000000000000000000000000000000000000'},0,${new Date(String(token.created_at))},${String(token.status)},${token.launchpad as string|null},${token.image_url as string|null},${token.price_usd as number|null},${token.market_cap_usd as number|null},${token.volume_24h_usd as number|null},${token.liquidity_usd as number|null},${token.bonding_progress as number|null},${Number(token.holders)||0},${token.quote as string|null})
      on conflict(address) do update set name=excluded.name,symbol=excluded.symbol,image_url=excluded.image_url,price_usd=case when tokens.price_at is null then excluded.price_usd else tokens.price_usd end,market_cap_usd=excluded.market_cap_usd,volume_24h_usd=excluded.volume_24h_usd,bonding_progress=excluded.bonding_progress,status=excluded.status,holders=excluded.holders`;
    updated++;
  }
  return {chainId:56,updated,source:market.source,metadataOnly:true};
}
