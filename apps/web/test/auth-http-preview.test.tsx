import {afterEach,describe,it,expect,vi} from 'vitest';
import {renderToString} from 'react-dom/server';

const mocks=vi.hoisted(()=>({
  effects:[] as Array<()=>void|(()=>void)>,
  replace:vi.fn(),setState:vi.fn(),
}));
vi.mock('react',async(importOriginal)=>({
  ...await importOriginal<typeof import('react')>(),
  useEffect:(effect:()=>void|(()=>void))=>{mocks.effects.push(effect);},
}));
vi.mock('next/navigation',()=>({usePathname:()=>'/trenches'}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('../lib/product',()=>({BNB_PRODUCT:true}));
vi.mock('../lib/auth',()=>({privyAppId:()=> 'fixture-app',setAuthState:mocks.setState,onAuthLoadRequest:vi.fn()}));
vi.mock('../lib/members',()=>({setMe:vi.fn()}));
vi.mock('../lib/session-hint',()=>({readHint:()=>null}));
vi.mock('../components/terminal/auth/onboarding',()=>({MemberGate:()=>null}));
import {AuthRoot} from '../components/terminal/auth/auth-root';

afterEach(()=>{mocks.effects.length=0;vi.clearAllMocks();vi.unstubAllGlobals();});
function mount(allowHttpPreview:boolean){
  vi.stubGlobal('window',{isSecureContext:false,location:{protocol:'http:',href:'http://135.181.237.187:3000/trenches',replace:mocks.replace}});
  renderToString(<AuthRoot allowHttpPreview={allowHttpPreview}/>);
  for(const effect of mocks.effects)effect();
}
describe('Privy in an explicit HTTP preview',()=>{
  it('keeps the preview page accessible and leaves secure-context authentication disabled',()=>{
    mount(true);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.setState).toHaveBeenCalledWith({ready:true,enabled:false});
  });
  it('retains the normal HTTPS redirect when HTTP preview was not authorized',()=>{
    mount(false);
    expect(mocks.replace).toHaveBeenCalledWith('https://135.181.237.187:3000/trenches');
  });
});
