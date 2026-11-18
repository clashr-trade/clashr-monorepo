import {describe,expect,it,vi,afterEach} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '../middleware';
import {buildCsp} from '../components/trade/csp';
afterEach(()=>vi.unstubAllEnvs());
describe('BSC wallet route security policy',()=>{
  it('serves the landing page in BNB mode while preserving the BSC terminal alias',()=>{
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID','56');
    for(const origin of ['http://localhost:3000','https://bnb.example']){
      const response=middleware(new NextRequest(`${origin}/`,{headers:{host:new URL(origin).host}}));
      expect(response.status).toBe(200);expect(response.headers.get('location')).toBeNull();
      const alias=middleware(new NextRequest(`${origin}/bsc`,{headers:{host:new URL(origin).host}}));
      expect(alias.status).toBe(307);expect(alias.headers.get('location')).toBe(`${origin}/trenches`);
    }
  });
  it('keeps BNB-only canonical pages on the owned host and excludes legacy API/RPC connections',()=>{
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID','56');
    for(const path of ['/feed','/agents','/leaderboard','/rush','/trenches']){
      const response=middleware(new NextRequest(`https://bnb.example${path}`,{headers:{host:'bnb.example'}}));
      expect(response.status).toBe(200);expect(response.headers.get('location')).toBeNull();
      const csp=response.headers.get('content-security-policy');expect(csp).toContain("'nonce-");expect(csp).not.toContain('api.rushr.trade');expect(csp).not.toContain('rpc.mainnet.chain.robinhood.com');
    }
    const alias=middleware(new NextRequest('https://bnb.example/bsc/feed',{headers:{host:'bnb.example'}}));
    expect(alias.headers.get('location')).toBe('https://bnb.example/feed');
  });
  it('redirects BSC pages to the terminal host and applies nonce CSP to token/agent routes',()=>{
    const redirect=middleware(new NextRequest('https://rushr.trade/bsc',{headers:{host:'rushr.trade'}}));
    expect(redirect.status).toBe(301);expect(redirect.headers.get('location')).toBe('https://app.rushr.trade/bsc');
    for(const path of ['/bsc','/bsc/agents','/bsc/token/0x'+'1'.repeat(40)]) {
      const response=middleware(new NextRequest(`https://app.rushr.trade${path}`,{headers:{host:'app.rushr.trade'}}));
      expect(response.headers.get('content-security-policy')).toContain("'nonce-");
      expect(response.headers.get('content-security-policy')).toContain("object-src 'none'");
    }
  });
  it('permits only the explicit BSC RPC origin and keeps production scripts nonce-protected',()=>{
    const csp=buildCsp({nonce:'reviewed-nonce',dev:false});
    const scripts=csp.split(';').find(d=>d.trim().startsWith('script-src'))!;
    expect(scripts).toContain("'nonce-reviewed-nonce'");expect(scripts).not.toContain('unsafe-inline');expect(scripts).not.toContain('unsafe-eval');
    expect(csp).toContain('https://bsc-dataseed.bnbchain.org');expect(csp).not.toContain('https://*.bnbchain.org');
    const local=middleware(new NextRequest('http://127.0.0.1:3000/bsc',{headers:{host:'127.0.0.1:3000'}}));
    expect(local.status).toBe(200);expect(local.headers.get('content-security-policy')).toContain("'nonce-");
  });
});
