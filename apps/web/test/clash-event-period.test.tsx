import {it,expect} from 'vitest';
import {renderToString} from 'react-dom/server';
import {LanguageProvider} from '../components/landing/language-provider';
import {RushView,type RushData} from '../components/terminal/rush-view';
const initial:RushData={event:{name:'Clash the Trenches',startsAt:'2026-11-24T18:00:00.000Z',endsAt:'2026-12-01T00:00:00.000Z',status:'live',prizes:{caller:300,gainer:300,trader:400},poolUsd:1000,rules:{minUsd:20,minLiquidityUsd:5000}},standings:{caller:[],gainer:[],trader:[]},updatedAt:'2026-11-24T18:00:00.000Z'};
it('renders actual UTC start/end times and treats the end as exclusive',()=>{
 const html=renderToString(<LanguageProvider initialLanguage="en"><RushView initial={initial} serverNow={Date.parse('2026-11-25T00:00:00Z')}/></LanguageProvider>);
 expect(html).toContain('18:00:00 UTC');expect(html).toContain('23:59:59 UTC');
 expect(html).toContain('Nov 24');expect(html).toContain('Nov 30');expect(html).not.toContain('Final results');
});
