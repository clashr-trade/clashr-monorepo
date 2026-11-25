import {describe,it,expect} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {buildMessage,verifySiwe} from '@clashr/agents/siwe';
import {productIdentity} from '../src/agents/wallet-auth';
const origin='http://135.181.237.187:3000';
describe('BNB wallet origin configuration',()=>{
 it('accepts the exact explicitly enabled VPS IPv4 preview',()=>{
  expect(productIdentity({CHAIN_ID:'56',PRODUCT_ORIGIN:origin,CLASHR_HTTP_PREVIEW_ORIGIN:origin})).toMatchObject({chainId:56,domain:'135.181.237.187:3000',uri:origin});
 });
 it.each([undefined,'http://135.181.237.188:3000','http://135.181.237.187:3001'])('rejects public HTTP without an exact preview opt-in: %s',preview=>{
  expect(()=>productIdentity({CHAIN_ID:'56',PRODUCT_ORIGIN:origin,CLASHR_HTTP_PREVIEW_ORIGIN:preview})).toThrow('Invalid BNB product origin');
 });
 it.each(['http://example.com','http://135.181.237.187:3000/','http://135.181.237.187:3000/path','http://user:pass@135.181.237.187:3000','invalid'])('rejects malformed origins and HTTP domains: %s',value=>{
  expect(()=>productIdentity({CHAIN_ID:'56',PRODUCT_ORIGIN:value,CLASHR_HTTP_PREVIEW_ORIGIN:value})).toThrow('Invalid BNB product origin');
 });
 it('preserves HTTPS, localhost and legacy-chain behavior',()=>{
  expect(productIdentity({CHAIN_ID:'56',PRODUCT_ORIGIN:'https://clashr.trade'})?.domain).toBe('clashr.trade');
  expect(productIdentity({CHAIN_ID:'56',PRODUCT_ORIGIN:'http://localhost:3000'})?.uri).toBe('http://localhost:3000');
  expect(productIdentity({CHAIN_ID:'4663',PRODUCT_ORIGIN:origin})).toBeUndefined();
 });
 it('verifies an IP-bound BNB wallet proof and rejects replay under another origin',async()=>{
  const wallet=privateKeyToAccount(('0x'+'12'.repeat(32)) as `0x${string}`);
  const identity=productIdentity({CHAIN_ID:'56',PRODUCT_ORIGIN:origin,CLASHR_HTTP_PREVIEW_ORIGIN:origin})!;
  const nonce='abcdef123456',issuedAt=new Date(),message=buildMessage({purpose:'human',address:wallet.address,nonce,issuedAt,identity});
  const signature=await wallet.signMessage({message});
  expect(await verifySiwe({message,signature,purpose:'human',nonce,identity})).toMatchObject({ok:true});
  expect(await verifySiwe({message,signature,purpose:'human',nonce,identity:{...identity,domain:'other.example',uri:'https://other.example'}})).toMatchObject({ok:false,error:'wrong_domain'});
 });
});
