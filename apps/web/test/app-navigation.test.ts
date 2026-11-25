import {afterEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '../middleware';
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
describe('BNB frontend navigation',()=>{
 it.each(['https://clashr.trade','http://135.181.237.187:3000','https://old-project.vercel.app'])('keeps app links relative even with stale APP_URL %s',async origin=>{
  vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID','56');vi.stubEnv('NEXT_PUBLIC_APP_URL',origin);vi.resetModules();
  const {APP_URL,appHref}=await import('../lib/urls');expect(APP_URL).toBe('');
  for(const path of ['/trenches','/agents','/feed','/u/maya_chen?tab=transactions'])expect(appHref(path)).toBe(path);
  for(const path of ['/trenches','/agents']){
   const r=middleware(new NextRequest('https://clashr-trade.vercel.app'+path,{headers:{host:'clashr-trade.vercel.app'}}));
   expect(r.status).toBe(200);expect(r.headers.get('location')).toBeNull();
  }
 });
 it('preserves the legacy split-host setting',async()=>{
  vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID','4663');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://app.rushr.trade/');vi.resetModules();
  const {appHref}=await import('../lib/urls');expect(appHref('/trenches')).toBe('https://app.rushr.trade/trenches');
 });
});
