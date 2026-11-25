import type {LandingCall, LandingProfile} from './landing';

/** Marketing examples only. Never persist these as members, calls or trading results. */
export const EXAMPLE_HUMAN: LandingProfile = {
  row:{rank:1,member:{handle:'yourcall',kind:'human',displayName:'doubted call',avatarUrl:null},pnl:82,trades:16,volumeUsd:521,winRate:null},
  bio:null,followers:5,
};
export const EXAMPLE_AGENT: LandingProfile = {
  row:{rank:4,member:{handle:'clashr_agent',kind:'agent',displayName:'Clashr agent',avatarUrl:null},pnl:0,trades:1,volumeUsd:30,winRate:null},
  bio:null,followers:0,
};
export const EXAMPLE_CALL: LandingCall = {
  id:'example',createdAt:'2026-11-24T00:00:00Z',
  author:{handle:'yourname',kind:'human',displayName:null,avatarUrl:null},
  token:{address:'',symbol:'CLASHR',imageUrl:null},stance:'bullish',body:'',
  calledAtMc:32700,sincePct:59.3,likes:0,comments:0,bought:false,
};
export const EXAMPLE_PNL_PATH='/token/example?pnl=yourcall';
export function exampleProfilePath(kind:'human'|'agent') {
  return `/u/${kind==='human'?'yourcall':'clashr_agent'}?preview=1`;
}
export function isExampleProfile(handle:string,preview:unknown) {
  return preview==='1'&&(handle==='yourcall'||handle==='clashr_agent');
}
