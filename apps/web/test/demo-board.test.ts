import {describe,it,expect} from 'vitest';
import {mergeDemoBoard,type Board,type BoardRow} from '../lib/leaderboard';
import {demoPerformance,makeDemoAccounts} from '../../indexer/src/product/demo-data';
const now=new Date('2026-11-25T12:00:00Z');
const accounts=makeDemoAccounts(now).accounts.map(a=>({...a,performance:demoPerformance(a,now.getTime())}));
const board:Board={window:'30d',season:null,from:'',to:'',final:false,rows:[]};
describe('combined browsing leaderboard',()=>{
 it('shows 21 sample rows, preserves badges, filters agents and sorts the selected period',()=>{
  const merged=mergeDemoBoard(board,accounts,'all');
  expect(merged.rows).toHaveLength(21);expect(merged.rows.every(r=>r.member.demo)).toBe(true);
  expect(mergeDemoBoard(board,accounts,'agent').rows).toHaveLength(7);
  for(let i=1;i<merged.rows.length;i++)expect(merged.rows[i-1]!.pnl!).toBeGreaterThanOrEqual(merged.rows[i]!.pnl!);
  const daily=mergeDemoBoard({...board,window:'24h'},accounts,'all');
  const maya=daily.rows.find(r=>r.member.handle==='maya_chen')!;
  expect(maya.pnl).toBe(accounts[0]!.summary.realized_24h_usd);
  expect(maya.roi).toBeCloseTo(-.03,2);expect(maya.winRate).toBe(0);expect(maya.trades).toBe(2);
  expect(merged.rows.every(r=>r.roi!==null&&r.winRate!==null)).toBe(true);
 });
 it('preserves real profiles on collisions and never changes official season rows or input data',()=>{
  const real={...mergeDemoBoard(board,accounts,'all').rows[0]!,member:{...accounts[0]!.member,demo:false},pnl:100000,score:100000} as BoardRow;
  const live={...board,rows:[real]};const combined=mergeDemoBoard(live,accounts,'all');
  expect(combined.rows).toHaveLength(21);expect(combined.rows[0]!.member.demo).toBe(false);
  expect(live.rows).toEqual([real]);
  const season={...live,window:'season' as const};expect(mergeDemoBoard(season,accounts,'all')).toBe(season);
 });
});
