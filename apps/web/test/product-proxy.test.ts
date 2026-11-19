import {describe,it,expect,vi} from 'vitest';
import {proxyProduct} from '../lib/product-proxy';
const origin='https://bnb.example',base='https://api.bnb.example';
const session='ws_'+'1'.repeat(64);
describe('BNB API/session isolation',()=>{
  it('forbids shared upstreams, admin paths and cross-origin writes before fetching',async()=>{
    const fetcher=vi.fn();
    expect((await proxyProduct(new Request(`${origin}/api/product/v1/me`),['v1','me'],'https://api.rushr.trade',fetcher)).status).toBe(503);
    expect((await proxyProduct(new Request(`${origin}/api/product/admin/sync-market`),['admin','sync-market'],base,fetcher)).status).toBe(404);
    expect((await proxyProduct(new Request(`${origin}/api/product/v1/me`,{method:'POST',headers:{origin:'https://evil.example'}}),['v1','me'],base,fetcher)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps session tokens in HttpOnly cookies and strips them from JSON',async()=>{
    const fetcher=vi.fn(async()=>Response.json({sessionToken:session,address:'0x'+'2'.repeat(40)},{headers:{'x-rushr-chain-id':'56'}}));
    const response=await proxyProduct(new Request(`${origin}/api/product/v1/auth/wallet/verify`,{method:'POST',headers:{origin},body:'{}'}),['v1','auth','wallet','verify'],base,fetcher);
    expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    expect(response.headers.get('set-cookie')).toContain('Secure');expect(await response.text()).not.toContain(session);
  });
  it('attaches only this product session and rejects a response without chain identity',async()=>{
    const fetcher=vi.fn(async(_url,init)=>{expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${session}`);return Response.json({member:{}},{headers:{'x-rushr-chain-id':'56'}});});
    const request=new Request(`${origin}/api/product/v1/me`,{headers:{cookie:`rushr_bnb_session=${session}`}});
    expect((await proxyProduct(request,['v1','me'],base,fetcher)).status).toBe(200);
    expect((await proxyProduct(request,['v1','me'],base,async()=>Response.json({chainId:4663}))).status).toBe(503);
  });
  it('uses the current Privy identity rather than an old wallet cookie',async()=>{
    const fetcher=vi.fn(async(_url,init)=>{
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer current-privy-token');
      return Response.json({member:{id:'email-member'}},{headers:{'x-rushr-chain-id':'56'}});
    });
    const request=new Request(`${origin}/api/product/v1/me`,{headers:{cookie:`rushr_bnb_session=${session}`,authorization:'Bearer current-privy-token'}});
    expect((await proxyProduct(request,['v1','me'],base,fetcher)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
