import {it,expect,vi,afterEach} from 'vitest';
import {cardMember} from '../lib/card/data';
afterEach(()=>vi.unstubAllGlobals());
it('refuses normal performance share-card exports for simulated profiles',async()=>{
 const member={handle:'maya_chen',kind:'human',wallet:'0x'+'ab'.repeat(20),avatarUrl:null,demo:true};
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({member})));expect(await cardMember('maya_chen')).toBeNull();
 member.demo=false;expect(await cardMember('maya_chen')).toMatchObject({handle:'maya_chen',wallet:member.wallet});
});
