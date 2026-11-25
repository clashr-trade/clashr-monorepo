import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ClashrSocial} from '../components/landing/clashr-social';
import type {LandingData} from '../lib/landing';
import {LanguageProvider} from '../components/landing/language-provider';
import {ClashrExampleView} from '../components/landing/clashr-example-view';
import {isExampleProfile} from '../lib/landing-examples';

describe('interactive landing social cards',()=>{
  it('populates example cards and links each card to its intended destination',()=>{
    const html=renderToStaticMarkup(<LanguageProvider initialLanguage="en"><ClashrSocial/></LanguageProvider>);
    expect(html.match(/<article /g)).toHaveLength(4);
    const targets=[...html.matchAll(/<a href="([^"]+)" class="clashr-card-target"/g)].map(match=>match[1]);
    expect(targets).toEqual(['/feed','/u/yourcall?preview=1','/u/clashr_agent?preview=1']);
    for(const example of ['+59.3%','+$82.00','+617.5%','$521.00','doubted call','Clashr agent'])expect(html).toContain(example);
    expect(html).not.toContain('https://x.com/intent/tweet?');
    expect(html).toContain('Preview');
    expect(html).not.toContain('/u/yourname');
    expect(html).not.toContain('/art/clashr-social-');
  });
  it('uses actual member routes, stats and call text when data is available',()=>{
    const row={rank:1,member:{handle:'bnb_trader',kind:'human' as const,displayName:'BNB Trader',avatarUrl:null},pnl:82,trades:16,volumeUsd:521,winRate:null};
    const data:LandingData={rows:[row],topHuman:{row,bio:null,followers:5},topAgent:null,flex:null,agentCall:null,call:{id:'call1',createdAt:'2026-11-24',author:row.member,token:{address:'0x123',symbol:'CAKE',imageUrl:null},stance:'bearish',body:'A recorded BNB market thesis',calledAtMc:32700,sincePct:-5,likes:3,comments:2,bought:false}};
    const html=renderToStaticMarkup(<LanguageProvider initialLanguage="en"><ClashrSocial data={data}/></LanguageProvider>);
    expect(html).toContain('href="/u/bnb_trader"');
    expect(html).toContain('A recorded BNB market thesis');
    expect(html).toContain('Bearish');
    expect(html).toContain('+$82.00');
    expect(html).not.toContain('+617.5%'); // Real account PnL replaces the example when available.
    expect(html).not.toContain('@yourcall');
    expect(html).toContain('Account PnL');
    expect(html).not.toContain('/token/example');
  });
  it('renders explicit example destinations without claiming real accounts or a deployed token',()=>{
    expect(isExampleProfile('yourcall','1')).toBe(true);
    expect(isExampleProfile('clashr_agent','1')).toBe(true);
    expect(isExampleProfile('yourcall',undefined)).toBe(false);
    expect(isExampleProfile('real_member','1')).toBe(false);
    const html=renderToStaticMarkup(<LanguageProvider initialLanguage="en"><ClashrExampleView kind="pnl"/></LanguageProvider>);
    expect(html).toContain('Example preview.');
    expect(html).toContain('+$123.50');
    expect(html).toContain('$143.50');
    expect(html).toContain('A verified CLASHR contract is not configured.');
    expect(html).not.toContain('0xa8ceeeb747fcf136947c35c5de6187ee90d6bfed');
  });
  it('shows a real position without making the PnL card navigable',()=>{
    const position={handle:'bnb_trader',token:'0x'+'2'.repeat(40),symbol:'CAKE',imageUrl:null,realizedUsd:10,returnPct:50,boughtUsd:20,soldUsd:30,heldHours:2};
    const row={rank:0,member:{handle:'bnb_trader',kind:'human' as const,displayName:null,avatarUrl:null},pnl:0,trades:0,volumeUsd:0,winRate:null};
    const data:LandingData={rows:[],call:null,agentCall:null,topHuman:{row,bio:null,followers:null,statsAvailable:false},topAgent:null,flex:null,position};
    const html=renderToStaticMarkup(<LanguageProvider initialLanguage="en"><ClashrSocial data={data}/></LanguageProvider>);
    const pnl=html.match(/<article class="clashr-social-card clashr-social-pnl"[\s\S]*?<\/article>/)?.[0]??'';
    expect(pnl).not.toContain('<a ');
    expect(html).not.toContain('Example cards are marked Preview.');
    expect(html).toContain('href="/u/bnb_trader"');
    expect(html).not.toContain('href="/u/bnb_trader?preview=1"');
    expect(html).toContain('+50.0%');expect(html).toContain('+$10.00');
    expect(html).not.toContain('+617.5%');expect(html).not.toContain('/token/example');
    const human=html.match(/<article class="clashr-social-card clashr-social-human"[\s\S]*?<\/article>/)?.[0]??'';
    expect(human).not.toContain('+$0.00'); // Unknown profile PnL stays unknown.
    expect(human).toContain('—');
  });
  it('uses actual handles when display names are missing, including the PnL owner',()=>{
    const human={rank:0,member:{handle:'muffia',kind:'human' as const,displayName:null,avatarUrl:null},pnl:0,trades:0,volumeUsd:0,winRate:null};
    const agent={...human,member:{handle:'clashr_demo',kind:'agent' as const,displayName:'  ',avatarUrl:null}};
    const data:LandingData={rows:[human,agent],call:null,agentCall:null,topHuman:{row:human,bio:null,followers:1},topAgent:{row:agent,bio:'Real agent bio',followers:0},flex:null,position:null};
    const html=renderToStaticMarkup(<LanguageProvider initialLanguage="en"><ClashrSocial data={data}/></LanguageProvider>);
    expect(html).toContain('class="clashr-social-name">muffia</a>');
    expect(html).toContain('class="clashr-social-name">clashr_demo</a>');
    expect(html).not.toContain('Your profile');expect(html).not.toContain('Your agent');
    const pnl=html.match(/<article class="clashr-social-card clashr-social-pnl"[\s\S]*?<\/article>/)?.[0]??'';
    expect(pnl).toContain('@muffia');expect(pnl).toContain('+$0.00');
    expect(pnl).not.toMatch(/yourcall|Example performance|617\.5|<a /);
  });
});
