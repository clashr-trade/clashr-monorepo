import {it,expect,vi,afterEach} from 'vitest';
import {readFlapMetadata,metadataCid} from '../src/bsc/flap-metadata';
const CID='bafkreihpbmakwzmihbndohe4vjbbeybehoaueeogcwtep5aghrv36lmupu';
afterEach(()=>vi.unstubAllGlobals());
it('normalizes IPFS references and gateway URLs without fetching supplied hosts',async()=>{
 const fetcher=vi.fn(async(_url:string)=>Response.json({image:'ipfs://ipfs/'+CID}));vi.stubGlobal('fetch',fetcher);
 for(const value of [CID,'ipfs://'+CID,'ipfs://ipfs/'+CID,'https://ipfs.io/ipfs/'+CID]){
  expect(metadataCid(value)).toBe(CID);expect((await readFlapMetadata(value)).image).toBe('https://flap.mypinata.cloud/ipfs/'+CID);
 }
 expect(fetcher.mock.calls.every(([url])=>String(url)==='https://flap.mypinata.cloud/ipfs/'+CID)).toBe(true);
 for(const value of ['https://localhost/secret','https://host/ipfs/'+CID+'/../secret','ipfs://'+CID+'/file','https://host/ipfs/'+CID+'?x=1'])expect(metadataCid(value)).toBeNull();
});
it('handles Flap bare image CIDs and bounded descriptions',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({image:CID,description:'a'.repeat(3000),website:'javascript:bad',twitter:'https://x.com/example'})));
 const result=await readFlapMetadata(CID);expect(result.image).toBe('https://flap.mypinata.cloud/ipfs/'+CID);expect(result.description).toHaveLength(2000);expect(result.website).toBeNull();
});
it('rejects invalid CIDs and oversized documents',async()=>{
 await expect(readFlapMetadata('https://localhost/secret')).rejects.toThrow('CID');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('a'.repeat(262145))));await expect(readFlapMetadata(CID)).rejects.toThrow('large');
});
