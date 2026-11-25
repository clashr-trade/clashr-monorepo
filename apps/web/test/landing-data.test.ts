import {afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('../lib/api',()=>({API_URL:'http://landing.test'}));
vi.mock('../lib/product',()=>({BNB_PRODUCT:true}));
import {getLandingData} from '../lib/landing';
import {normalizeLandingPosition} from '../lib/landing-position';

const wallet='0x'+'1'.repeat(40),token='0x'+'2'.repeat(40);
const member={handle:'real_human',kind:'human' as const,displayName:'Real human',avatarUrl:null};
const agent={...member,handle:'real_agent',kind:'agent' as const};
const row={rank:1,member,pnl:0,trades:0,volumeUsd:0,winRate:null};
const position={token,symbol:'CAKE',image_url:null,bought_usd:20,sold_usd:30,realized_usd:10,buys:1,sells:1,held_tokens:'0',transferred_out_tokens:'0',unbacked:false,partial_history:false,first_trade_at:'2026-11-24T00:00:00Z',last_trade_at:'2026-11-24T02:00:00Z'};
function mockApi(rows:unknown[],items:unknown[]=[],hasPosition=false){
  vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
    const u=new URL(input);
    if(u.pathname==='/v1/feed')return Response.json({items});
    if(u.pathname==='/v1/leaderboard')return Response.json({rows});
    if(u.pathname.startsWith('/v1/members/'))return Response.json({member:{...member,handle:u.pathname.split('/').pop(),wallet,bio:'Actual profile',followers:3}});
    if(u.pathname===`/wallets/${wallet}/pnl`)return Response.json({positions:hasPosition?[{token}]:[]});
    if(u.pathname===`/wallets/${wallet}/positions/${token}`)return Response.json({position});
    return Response.json({error:'not_found'},{status:404});
  }));
}
afterEach(()=>vi.unstubAllGlobals());
describe('real landing data with independent previews',()=>{
  it('features registered humans and agents before their first trade',async()=>{
    mockApi([row,{...row,rank:2,member:agent}]);
    const data=await getLandingData();
    expect(data.topHuman?.row.member.handle).toBe('real_human');
    expect(data.topAgent?.row.member.handle).toBe('real_agent');
    expect(data.topHuman?.followers).toBe(3);
    expect(data.topHuman?.statsAvailable).toBe(true);
    expect(data.position).toBeNull();
  });
  it('uses an actual call author even without leaderboard or return coverage',async()=>{
    mockApi([],[{id:'real_call',createdAt:'2026-11-24',author:member,token:{address:token,symbol:'CAKE',imageUrl:null},stance:'bullish',body:'Watching this BNB launch.',atPost:{marketCapUsd:null},result:{sincePostPct:null},likes:0,comments:0,entry:null}]);
    const data=await getLandingData();
    expect(data.call?.id).toBe('real_call');
    expect(data.topHuman?.row.member.handle).toBe('real_human');
    expect(data.topHuman?.statsAvailable).toBe(false);
  });
  it('selects complete BNB position data for the PnL card',async()=>{
    mockApi([row],[],true);
    expect((await getLandingData()).position).toMatchObject({handle:'real_human',token,symbol:'CAKE',realizedUsd:10,returnPct:50,boughtUsd:20,soldUsd:30,heldHours:2});
  });
  it('retains empty fallbacks when the API cannot be reached',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('offline');}));
    const data=await getLandingData();
    expect(data.topHuman).toBeNull();expect(data.topAgent).toBeNull();expect(data.position).toBeNull();
  });
  it('rejects incomplete history, transfers, open balances and invalid amounts',()=>{
    for(const bad of [{partial_history:true},{unbacked:true},{transferred_out_tokens:'1'},{held_tokens:'1'},{bought_usd:0},{realized_usd:NaN},{realized_usd:'10'},{token:wallet}])expect(normalizeLandingPosition('real_human',token,{...position,...bad})).toBeNull();
    expect(normalizeLandingPosition('real_human',token,{...position,realized_usd:-10,sold_usd:10})?.returnPct).toBe(-50);
  });
});
