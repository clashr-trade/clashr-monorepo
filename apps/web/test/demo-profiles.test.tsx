import {describe,it,expect,vi,beforeEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {makeDemoAccounts,demoPnlHistory} from '../../indexer/src/product/demo-data';
const state=vi.hoisted(()=>({account:null as any,holdings:vi.fn(),relationship:vi.fn()}));
vi.mock('@/lib/auth',async original=>({...await original<typeof import('../lib/auth')>(),useAuth:()=>({authenticated:false,enabled:true,ready:true,user:null})}));
vi.mock('@/lib/holdings',()=>({useWalletHoldings:(wallet:string|null)=>{state.holdings(wallet);return {state:'ready',items:[],totalUsd:100,refresh:()=>{}};}}));
vi.mock('@/lib/profile',async original=>({...await original<typeof import('../lib/profile')>(),
 useProfileMember:()=>({state:'ready',data:state.account.member}),
 useWalletPnl:()=>({state:'ready',data:{summary:state.account.summary,positions:state.account.positions}}),
 usePnlHistory:()=>({state:'ready',data:demoPnlHistory(state.account,'7d')}),
 useWalletTrades:()=>({state:'ready',data:state.account.trades}),
 useCallouts:()=>({state:'ready',data:[]}),useSuggestions:()=>({state:'ready',data:[]}),
 useRelationship:(ref:string|null)=>{state.relationship(ref);return {state:null,toggle:()=>{},busy:false};},
 useDemoProfiles:()=>({state:'ready',data:{items:makeDemoAccounts().accounts}})
}));
import {PublicProfile} from '../components/terminal/profile/profile-view';
import {DemoDirectory} from '../components/terminal/demo-directory';
import {LanguageProvider} from '../components/landing/language-provider';
const render=(element:React.ReactNode)=>renderToStaticMarkup(<LanguageProvider initialLanguage="en">{element}</LanguageProvider>);
beforeEach(()=>{state.account=makeDemoAccounts().accounts[0];state.holdings.mockClear();state.relationship.mockClear();});
describe('demo profile integration',()=>{
 it('renders simulated transactions and PnL without reading a real wallet or enabling share/follow actions',()=>{
  const html=render(<PublicProfile handle="maya_chen"/>);
  expect(html).toContain('Maya Chen');expect(html).not.toContain('Demo profile');expect(html).toContain('Trades, balances and PnL are simulated.');
  expect(html).toContain('Share');expect(html).not.toContain('Browse demo profiles');expect(html).not.toContain('Simulated portfolio');expect(html).toContain(state.account.member.wallet);
  expect(html).toContain('Transactions');expect(html).toContain('CAKE');expect(html).toContain('WBNB');
  expect(html).not.toContain('Share the CAKE trade');expect(html).not.toContain('Share the WBNB trade');
  expect(state.holdings).toHaveBeenCalledWith(null);expect(state.relationship).toHaveBeenCalledWith(null);
 });
 it('keeps normal profiles connected to their actual wallet',()=>{
  state.account.member.demo=false;render(<PublicProfile handle="maya_chen"/>);
  expect(state.holdings).toHaveBeenCalledWith(state.account.member.wallet);expect(state.relationship).toHaveBeenCalledWith('maya_chen');
 });
 it('links all 21 names to application profile routes and labels the fixture directory',()=>{
  const html=render(<DemoDirectory/>);
  expect(html).toContain('/u/maya_chen');expect(html).toContain('/u/aster_alpha');expect(html.match(/href="\/u\//g)).toHaveLength(21);
  expect(html).toContain('These fictional profiles cannot sign in');
 });
 it('renders a separate ranked demo board and an agent-only initial directory',()=>{
  const accounts=makeDemoAccounts().accounts.sort((a,b)=>b.summary.realized_usd-a.summary.realized_usd||a.member.handle.localeCompare(b.member.handle));
  const board=render(<DemoDirectory embedded ranked/>);
  expect(board).toContain('Demo leaderboard');expect(board).toContain('#1');
  expect(board.indexOf('/u/'+accounts[0]!.member.handle)).toBeLessThan(board.indexOf('/u/'+accounts[20]!.member.handle));
  const agents=render(<DemoDirectory embedded initialKind="agent"/>);
  expect(agents.match(/href="\/u\//g)).toHaveLength(7);expect(agents).not.toContain('/u/maya_chen');
 });

});
