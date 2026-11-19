import {it,expect,vi,afterEach} from 'vitest';
const rpc=vi.hoisted(()=>({getChainId:vi.fn(async()=>56),readContract:vi.fn(async({functionName}:{functionName:string})=>functionName==='decimals'?6:'QUOTE')}));
vi.mock('viem',()=>({createPublicClient:()=>rpc,erc20Abi:[],http:()=>null}));
import {assetDisplayQuote} from '../src/product/flap-pricing';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('prices the exact BSC quote asset using the deepest valid base-token pair and actual decimals',async()=>{
 const asset='0x'+'11'.repeat(20);
 const fetcher=vi.fn(async()=>Response.json({pairs:[
  {chainId:'ethereum',baseToken:{address:asset},priceUsd:'999',liquidity:{usd:999999}},
  {chainId:'bsc',baseToken:{address:'0x'+'22'.repeat(20)},priceUsd:'999',liquidity:{usd:999999}},
  {chainId:'bsc',baseToken:{address:asset},priceUsd:'2',liquidity:{usd:100}},
  {chainId:'bsc',baseToken:{address:asset},priceUsd:'3',liquidity:{usd:1000}},
 ]}));vi.stubGlobal('fetch',fetcher);
 const [a,b]=await Promise.all([assetDisplayQuote(asset,'https://rpc.invalid'),assetDisplayQuote(asset,'https://rpc.invalid')]);
 expect(a).toMatchObject({usd:3,decimals:6,symbol:'QUOTE'});expect(b).toEqual(a);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await assetDisplayQuote(asset)).toEqual(a);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not assume USD parity when no matching liquid pair exists',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({pairs:[]})));
 expect(await assetDisplayQuote('0x'+'33'.repeat(20),'https://rpc.invalid')).toBeNull();
});
it('rejects an RPC on a different chain before reading quote metadata',async()=>{
 rpc.getChainId.mockResolvedValueOnce(1);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect(await assetDisplayQuote('0x'+'44'.repeat(20),'https://rpc.invalid')).toBeNull();expect(fetcher).not.toHaveBeenCalled();expect(rpc.readContract).not.toHaveBeenCalled();
});
