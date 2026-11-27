import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LanguageProvider} from '../components/landing/language-provider';
vi.mock('../lib/product',()=>({BNB_PRODUCT:true}));
import {RushView,type RushData} from '../components/terminal/rush-view';
const event={name:'Clash the Trenches',startsAt:'2026-11-27T10:00:00.000Z',endsAt:'2026-12-04T10:00:00.000Z',status:'upcoming' as const,prizes:{caller:300,gainer:300,trader:400},poolUsd:1000,rules:{minUsd:20,minLiquidityUsd:5000}};
const data:RushData={event,standings:{caller:[],gainer:[],trader:[]},updatedAt:event.startsAt};
const render=(now:string)=>renderToStaticMarkup(<LanguageProvider initialLanguage="en"><RushView initial={data} serverNow={Date.parse(now)}/></LanguageProvider>);
it('shows the exact UTC seven-day schedule and Clashr rules before the start',()=>{
 const html=render('2026-11-27T09:00:00Z');
 expect(html).toContain('Upcoming');expect(html).toContain('Season 0 event');
 expect(html).toContain('Fri, Nov 27');expect(html).toContain('Fri, Dec 4');
 expect(html.match(/10:00 UTC/g)).toHaveLength(2);expect(html).not.toContain('00:00 UTC');
 expect(html).toContain('Only trades made on CLASHR count');
 expect(html).toContain('Simulated profiles and trades do not qualify for prizes.');
 expect(html).toContain('href="/trenches"');expect(html).toContain('href="/feed"');
 expect(html).not.toContain('Final results');
});
it('switches to live exactly at the configured start',()=>{
 const html=render(event.startsAt);expect(html).toContain('Ends in');expect(html).not.toContain('Upcoming');
});
