const COOKIE='rushr_bnb_session';
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
    const body=['GET','HEAD'].includes(request.method)?undefined:await request.text();
    if(body&&body.length>16_384)return new Response(null,{status:413});
    const upstream=await fetcher(target,{method:request.method,headers:forwarded,body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20_000)});
    if(upstream.headers.get('x-rushr-chain-id')!=='56')throw new Error('Unverified chain');
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
