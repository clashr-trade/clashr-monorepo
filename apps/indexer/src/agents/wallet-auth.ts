import { Hono } from 'hono';
import { newNonce, sha256Hex } from '@clashr/agents/crypto';
import { buildMessage, peekSiwe, verifySiwe, NONCE_TTL_MS, type SiweIdentity } from '@clashr/agents/siwe';
import { fail, isAddr, limit, PRIVATE, type Ctx } from './http';
import type { AgentsEnv } from './env';
import {findDemoAccount} from '../product/demo';

export function productIdentity(env: Pick<AgentsEnv, 'CHAIN_ID' | 'PRODUCT_ORIGIN' | 'CLASHR_HTTP_PREVIEW_ORIGIN'>): SiweIdentity | undefined {
  if (env.CHAIN_ID !== '56') return undefined;
  if (!env.PRODUCT_ORIGIN) throw fail(503, 'auth_unavailable', 'Configure the owned BNB product origin.');
  let url:URL;
  try { url = new URL(env.PRODUCT_ORIGIN); }
  catch { throw fail(503, 'auth_unavailable', 'Invalid BNB product origin.'); }
  const octets=url.hostname.split('.');
  // Match the web server's explicit IP preview setting; never infer SIWE identity from Host.
  const ipPreview=url.protocol==='http:'&&env.CLASHR_HTTP_PREVIEW_ORIGIN===url.origin
    &&octets.length===4&&octets.every(part=>/^\d{1,3}$/.test(part)&&Number(part)<=255);
  if (url.origin !== env.PRODUCT_ORIGIN || (url.protocol !== 'https:' && !(url.protocol === 'http:' && (['localhost', '127.0.0.1'].includes(url.hostname)||ipPreview)))) {
    throw fail(503, 'auth_unavailable', 'Invalid BNB product origin.');
  }
  return { chainId: 56, domain: url.host, uri: url.origin, termsUrl: `${url.origin}/terms` };
}
export const walletAuth = new Hono<Ctx>();
walletAuth.use('/auth/wallet/*', async (c, next) => {
  if (!productIdentity(c.env)) throw fail(404, 'not_found', 'Wallet sessions are available on the BNB product only.');
  await next();
});
walletAuth.get('/auth/wallet/nonce', async c => {
  await limit(c, 'nonce');
  const address = (c.req.query('address') ?? '').toLowerCase();
  if (!isAddr(address)) throw fail(422, 'invalid_field', 'A wallet address is required.');
  if(c.env.CHAIN_ID==='56'&&await findDemoAccount(c.var.sql,address))throw fail(403,'demo_read_only','Demo profiles cannot sign in.');
  const nonce = newNonce(), issuedAt = new Date();
  const message = buildMessage({ purpose: 'human', address, nonce, issuedAt, identity: productIdentity(c.env) });
  await c.var.sql`delete from wallet_nonces where expires_at < now()`;
  const [count] = await c.var.sql`select count(*)::int as n from wallet_nonces where address=${address} and used_at is null`;
  if (Number(count?.n) >= 5) throw fail(429, 'rate_limited', 'Too many outstanding wallet challenges.');
  await c.var.sql`insert into wallet_nonces(nonce,address,message,expires_at) values(${nonce},${address},${message},${new Date(issuedAt.getTime()+NONCE_TTL_MS)})`;
  return c.json({ message, expiresAt: new Date(issuedAt.getTime()+NONCE_TTL_MS) }, 200, PRIVATE);
});
walletAuth.post('/auth/wallet/verify', async c => {
  await limit(c, 'login');
  const b = c.var.body as {message?:unknown;signature?:unknown};
  if (typeof b.message !== 'string' || typeof b.signature !== 'string') throw fail(422, 'invalid_field', 'Message and signature are required.');
  const peek = peekSiwe(b.message);
  if (!peek) throw fail(401, 'invalid_signature', 'Invalid wallet challenge.');
  const token = `ws_${Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('')}`;
  const expiresAt = new Date(Date.now()+12*60*60_000);
  await c.var.sql.begin(async tx => {
    const [row] = await tx`select * from wallet_nonces where nonce=${peek.nonce} for update`;
    if (!row || row.used_at || row.message !== b.message || row.expires_at.getTime() <= Date.now()) throw fail(401, 'nonce_used', 'Challenge is unknown, expired or already used.');
    const proof = await verifySiwe({message:b.message as string,signature:b.signature as string,purpose:'human',nonce:peek.nonce,identity:productIdentity(c.env)});
    if (!proof.ok || proof.value.address !== row.address) throw fail(401, 'invalid_signature', 'Wallet proof did not verify.');
    const [member] = await tx`select kind,status from members where wallet=${proof.value.address}`;
    if (member && (member.kind !== 'human' || member.status !== 'active')) throw fail(403, 'wallet_unavailable', 'This wallet cannot start a human session.');
    await tx`update wallet_nonces set used_at=now() where nonce=${peek.nonce}`;
    await tx`insert into wallet_sessions(token_hash,address,expires_at) values(${await sha256Hex(token)},${proof.value.address},${expiresAt})`;
  });
  return c.json({sessionToken:token,address:peek.address,expiresAt},200,PRIVATE);
});
walletAuth.get('/auth/wallet/session', c => {
  if (!c.var.viewer.walletAddress) return c.json({address:null},200,PRIVATE);
  return c.json({address:c.var.viewer.walletAddress},200,PRIVATE);
});
walletAuth.post('/auth/wallet/logout', async c => {
  if (c.var.viewer.sessionHash) await c.var.sql`delete from wallet_sessions where token_hash=${c.var.viewer.sessionHash}`;
  return c.json({ok:true},200,PRIVATE);
});
