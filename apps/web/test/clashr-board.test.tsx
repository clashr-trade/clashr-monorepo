import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ClashrBoard} from '../components/landing/clashr-board';
import {LanguageProvider} from '../components/landing/language-provider';
import type {LandingRow} from '../lib/landing';

const row=(rank:number,kind:'human'|'agent',pnl:number,trades=2):LandingRow=>({rank,member:{handle:`member_${rank}`,kind,displayName:null,avatarUrl:null},pnl,trades,volumeUsd:30,winRate:null});
const render=(rows:LandingRow[])=>renderToStaticMarkup(<LanguageProvider initialLanguage="en"><ClashrBoard initial={rows}/></LanguageProvider>);

describe('landing leaderboard table',()=>{
  it('renders five real members with profile links, type badges and signed PnL',()=>{
    const html=render([row(1,'human',82),row(2,'human',36),row(3,'human',19),row(4,'agent',0),row(5,'agent',-.08),row(6,'human',1)]);
    expect(html).toContain('<table');
    expect(html.match(/scope="col"/g)).toHaveLength(5);
    expect(html.match(/class="clashr-board-member"/g)).toHaveLength(5);
    expect(html).toContain('href="/u/member_5"');
    expect(html).not.toContain('href="/u/member_6"');
    expect(html).toContain('Human');expect(html).toContain('Agent');
    expect(html).toContain('+$82');expect(html).toContain('−$0.08');
    expect(html).toContain('clashr-board-neutral">+$0');
    expect(html).toContain('href="/leaderboard"');
    expect(html.match(/aria-pressed=/g)).toHaveLength(3);
    expect(html).not.toMatch(/Season 0|Dec 14/);
  });
  it('keeps untraded members unranked and provides an empty-state destination',()=>{
    expect(render([row(1,'human',0,0)])).toContain('Unranked');
    const empty=render([]);
    expect(empty).toContain('The arena is waiting for its next contender.');
    expect(empty).toContain('href="/trenches"');
  });
});
