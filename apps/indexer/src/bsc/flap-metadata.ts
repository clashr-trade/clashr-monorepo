/** Extract only a root CID, then fetch through the fixed gateway, never an arbitrary supplied host. */
export function metadataCid(value:string){
 let cid=value;
 if(value.startsWith('ipfs://'))cid=value.slice(7).replace(/^ipfs\//,'');
 else if(value.startsWith('https://')){try{const url=new URL(value);cid=url.pathname.startsWith('/ipfs/')&&!url.search&&!url.hash?url.pathname.slice(6):'';}catch{return null;}}
 return /^(baf[yk][a-z2-7]{20,120}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/.test(cid)?cid:null;
}
export async function readFlapMetadata(value:string){
 const cid=metadataCid(value);if(!cid)throw new Error('Invalid metadata CID');
 const response=await fetch(`https://flap.mypinata.cloud/ipfs/${cid}`,{signal:AbortSignal.timeout(6000)});
 if(!response.ok||Number(response.headers.get('content-length'))>262144)throw new Error('Metadata unavailable');
 const reader=response.body?.getReader();if(!reader)throw new Error('Missing metadata');
 let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>262144)throw new Error('Metadata too large');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>undefined);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const data=JSON.parse(new TextDecoder().decode(bytes));
 const link=(v:unknown)=>typeof v==='string'&&v.startsWith('https://')&&v.length<2048?v:null;
 const imageCid=typeof data.image==='string'?metadataCid(data.image):null;
 const image=imageCid?`https://flap.mypinata.cloud/ipfs/${imageCid}`:link(data.image);
 return {description:typeof data.description==='string'?data.description.slice(0,2000):null,image,website:link(data.website),twitter:link(data.twitter),telegram:link(data.telegram)};
}
