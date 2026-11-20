import { BNB_SESSION_COOKIE } from './brand-compat';
const COOKIE=BNB_SESSION_COOKIE;
async function limitedBody(request:Pick<Request,'body'>,max:number):Promise<Uint8Array<ArrayBuffer>|null>{
  const reader=request.body?.getReader();
  if(!reader)return new Uint8Array();
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>max){await reader.cancel();return null;}chunks.push(value);
  }}finally{reader.releaseLock();}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}return body;
}
/** Same-origin BNB API boundary. The session token stays in an HttpOnly cookie, never browser storage. */
export async function proxyProduct(request:Request,parts:string[],base:string|undefined,fetcher:typeof fetch=fetch):Promise<Response>{
  const headers={'cache-control':'private, no-store'};
  if(!['v1','search','tokens','wallets'].includes(parts[0]??''))return new Response(null,{status:404,headers});
  if(!base)return Response.json({error:{code:'product_not_configured',message:'Configure the dedicated BNB API.'}},{status:503,headers});
  let target:URL;
  try{target=new URL(base);if(target.username||target.password||target.pathname!=='/'||target.search||target.hash
    ||!['http:','https:'].includes(target.protocol)||/(^|\.)rushr\.trade$/i.test(target.hostname))throw new Error();}
  catch{return Response.json({error:{code:'invalid_product_origin',message:'BNB requires an owned, independent API origin.'}},{status:503,headers});}
  if(parts.some(p=>!p||p==='.'||p==='..'||/[\/\\%?#\u0000]/.test(p)))return new Response(null,{status:400});
  const own=new URL(request.url),origin=request.headers.get('origin');
  if(!['GET','HEAD','OPTIONS'].includes(request.method)&&origin!==own.origin)return new Response('Invalid origin',{status:403,headers});
  target.pathname=`/${parts.join('/')}`;target.search=own.search;
  const forwarded=new Headers({'accept':'application/json'});
  const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  // An explicit current identity (Privy or an agent key) must win over an older
  // wallet cookie, otherwise email login silently operates as the previous user.
  const authorization=request.headers.get('authorization');
  if(authorization?.startsWith('Bearer ')&&authorization.length<=4103)forwarded.set('authorization',authorization);
  else if(token&&/^ws_[0-9a-f]{64}$/.test(token)&&!['v1/auth/wallet/nonce','v1/auth/wallet/verify'].includes(parts.join('/')))forwarded.set('authorization',`Bearer ${token}`);
  if(origin)forwarded.set('origin',origin);
  if(request.headers.has('content-type'))forwarded.set('content-type',request.headers.get('content-type')!);
  try{
    const upload=request.method==='POST'&&parts.length===3&&parts[0]==='v1'&&parts[1]==='me'&&['avatar','banner'].includes(parts[2]!);
    const max=upload?(parts[2]==='avatar'?1_000_000:3_000_000):16_384;
    const body=['GET','HEAD'].includes(request.method)?undefined:await limitedBody(request,max);
    if(body===null)return Response.json({error:{code:'too_large',message:'Request body exceeds the size limit.'}},{status:413,headers});
    const upstream=await fetcher(target,{method:request.method,headers:forwarded,body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20_000)});
    const chain=upstream.headers.get('x-clashr-chain-id')??upstream.headers.get('x-rushr-chain-id');
    const legacyChain=upstream.headers.get('x-rushr-chain-id');
    if(chain!=='56'||(legacyChain!==null&&legacyChain!=='56'))throw new Error('Unverified chain');
    if(request.method==='GET'&&parts.length===5&&parts[0]==='v1'&&parts[1]==='media'&&['avatar','banner'].includes(parts[2]!)&&upstream.ok){
      const type=upstream.headers.get('content-type')?.split(';')[0]??'';
      if(!/^image\/(png|jpeg|webp|gif)$/.test(type))throw new Error('Invalid media type');
      const image=await limitedBody(upstream,3_000_000);
      if(!image||!image.byteLength)throw new Error('Invalid media size');
      return new Response(image,{headers:{'content-type':type,'cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'"}});
    }
    const responseHeaders=new Headers(headers);responseHeaders.set('content-type','application/json');
    let data=await upstream.json() as Record<string,unknown>;
    const secure=own.protocol==='https:'?'; Secure':'';
    if(parts.join('/')==='v1/auth/wallet/verify'&&upstream.ok){
      if(typeof data.sessionToken!=='string'||!/^ws_[0-9a-f]{64}$/.test(data.sessionToken))throw new Error('Invalid session');
      responseHeaders.set('set-cookie',`${COOKIE}=${data.sessionToken}; HttpOnly; SameSite=Strict; Path=/api/product; Max-Age=43200${secure}`);
      const {sessionToken:_,...publicData}=data;data=publicData;
    }
    if(parts.join('/')==='v1/auth/wallet/logout')responseHeaders.set('set-cookie',`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/product; Max-Age=0${secure}`);
    return Response.json(data,{status:upstream.status,headers:responseHeaders});
  }catch{return Response.json({error:{code:'product_unavailable',message:'The independent BNB API could not be reached.'}},{status:503,headers});}
}
