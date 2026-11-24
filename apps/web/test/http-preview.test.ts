import {afterEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {httpPreviewOrigin} from '../lib/http-preview';
import {middleware} from '../middleware';
import {proxyProduct} from '../lib/product-proxy';

const origin='http://135.181.237.187:3000';
afterEach(()=>vi.unstubAllEnvs());
function page(host='135.181.237.187:3000') {
  return middleware(new NextRequest(`http://${host}/trenches`,{headers:{host}}));
}
describe('explicit optimized HTTP IP preview',()=>{
  it('keeps HTTPS enforcement unless the exact IP origin is explicitly enabled',()=>{
    vi.stubEnv('NODE_ENV','production');
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID','56');
    vi.stubEnv('CLASHR_HTTP_PREVIEW_ORIGIN','');
    expect(page().status).toBe(301);
    vi.stubEnv('CLASHR_HTTP_PREVIEW_ORIGIN',origin);
    expect(page().status).toBe(200);
    expect(page().headers.get('strict-transport-security')).toBeNull();
    const policy=page().headers.get('content-security-policy')!;
    expect(policy).not.toContain('upgrade-insecure-requests');
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("'nonce-");
    expect(page('135.181.237.187:3001').status).toBe(301);
    expect(page('203.0.113.5:3000').status).toBe(301);
    expect(page('app.clashr.trade').status).toBe(301);
  });
  it('rejects domain names, credentials, paths and non-HTTP preview values',()=>{
    for(const value of ['', 'invalid','https://135.181.237.187:3000','http://example.com','http://user:pass@135.181.237.187:3000','http://135.181.237.187/path','http://135.181.237.187/?key=x']) {
      vi.stubEnv('CLASHR_HTTP_PREVIEW_ORIGIN',value);
      expect(httpPreviewOrigin()).toBeNull();
    }
  });
  it('allows the configured preview origin for API writes while rejecting other origins',async()=>{
    vi.stubEnv('NODE_ENV','production');
    vi.stubEnv('CLASHR_HTTP_PREVIEW_ORIGIN',origin);
    const fetcher=vi.fn(async()=>Response.json({ok:true},{headers:{'x-clashr-chain-id':'56'}}));
    const write=(from:string)=>proxyProduct(new Request('http://localhost:3000/api/product/v1/me',{
      method:'POST',headers:{origin:from},body:'{}',
    }),['v1','me'],'http://127.0.0.1:8790',fetcher);
    expect((await write(origin)).status).toBe(200);
    expect((await write('http://135.181.237.187:3001')).status).toBe(403);
    expect((await write('https://untrusted.invalid')).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
