import {describe,it,expect,vi} from 'vitest';
import {BscRpc,BscRpcRequestError} from '../src/bsc/rpc';

describe('safe BNB RPC diagnostics',()=>{
  it('retries temporary per-second throttling without restarting a verified batch',async()=>{
    vi.useFakeTimers();
    try{
      const fetcher=vi.fn().mockResolvedValueOnce(Response.json({error:{code:429,message:'compute units per second capacity exceeded'}},{status:429})).mockResolvedValueOnce(Response.json({id:1,result:'0x38'}));
      const result=new BscRpc('https://rpc.invalid',fetcher).chainId();
      await vi.advanceTimersByTimeAsync(1000);
      expect(await result).toBe(56);expect(fetcher).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetcher.mock.calls[0]![1].body).id).toBe(JSON.parse(fetcher.mock.calls[1]![1].body).id);
    }finally{vi.useRealTimers();}
  });
  it('identifies the blocked method and quota failure without logging provider secrets',async()=>{
    const fetcher=vi.fn(async()=>Response.json({error:{code:-32600,message:'Monthly capacity exceeded at https://provider.invalid/v2/SECRET'}},{status:403}));
    const rpc=new BscRpc('https://provider.invalid/v2/SECRET',fetcher);
    const error=await rpc.logs(123n,123n,['0x'+'11'.repeat(20)],[]).catch(error=>error);
    expect(error).toBeInstanceOf(BscRpcRequestError);
    expect(error.message).toContain('eth_getLogs HTTP 403');
    expect(error.reason).toBe('provider capacity/quota exceeded');
    expect(error.retryAfterMs).toBe(60_000);
    expect(error.message).not.toContain('SECRET');
    expect(error.message).not.toContain('provider.invalid');
  });
  it('handles a non-JSON forbidden response and backs off instead of assuming a chain failure',async()=>{
    const rpc=new BscRpc('https://provider.invalid',vi.fn(async()=>new Response('Forbidden',{status:403})));
    const error=await rpc.chainId().catch(error=>error);
    expect(error).toMatchObject({method:'eth_chainId',status:403,retryAfterMs:60_000});
    expect(error.message).toContain('check quota, key and allowlists');
  });
  it('reports an HTTP-200 JSON-RPC error and preserves wrong-chain rejection',async()=>{
    const rpc=new BscRpc('https://provider.invalid',vi.fn(async()=>Response.json({id:1,error:{code:-32601,message:'Method not found'}})));
    await expect(rpc.header('finalized')).rejects.toMatchObject({method:'eth_getBlockByNumber',rpcCode:-32601,reason:'provider method unavailable or restricted'});
    const wrong=new BscRpc('https://provider.invalid',vi.fn(async()=>Response.json({id:1,result:'0x1'})));
    await expect(wrong.chainId()).rejects.toThrow('chain mismatch');
  });
});
