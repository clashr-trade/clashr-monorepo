import {it,expect} from 'vitest';
import type {TokenSnapshot} from '@rushr/core';
import {projectFlapSafety,firstFunding,bscWalletIsContract} from '../src/bsc/flap-safety';
const dev='0x'+'11'.repeat(20),buyer='0x'+'22'.repeat(20),funder='0x'+'33'.repeat(20);
const snapshot:TokenSnapshot={address:'0x'+'44'.repeat(20),symbol:'TEST',totalSupply:1000n,burnt:100n,deployer:dev,createdAt:1000,createdBlock:100n,holders:[{wallet:dev,amount:90n},{wallet:buyer,amount:90n}],holderCount:2,earlyBuys:[{trader:buyer,block:101n,time:1002,tokenAmount:90n}],launchIndexed:true,wallets:{[dev]:{firstFunder:funder,firstSeen:900},[buyer]:{firstFunder:funder,firstSeen:950}},airdropped:[],devTokens:[],twinOrganicHolders:0,launchpad:'flap',now:1100};
it('reuses circulating-supply concentration and launch classification without manufacturing a safety verdict',()=>{
 expect(projectFlapSafety(snapshot,{holders:true,launch:true,funding:true})).toMatchObject({top10Pct:20,devPct:10,sniperCount:1,snipersPct:10,bundledPct:10,insidersPct:10,freshWalletsPct:100,noSells:null,verified:null,renounced:null,risk:null});
});
it('masks incomplete holder, launch and funding coverage instead of reporting zero',()=>{
 expect(projectFlapSafety(snapshot,{holders:false,launch:false,funding:false})).toMatchObject({top10Pct:null,devPct:null,sniperCount:null,snipersPct:null,bundledPct:null,insidersPct:null,freshWalletsPct:null});
 expect(projectFlapSafety(snapshot,{holders:true,launch:true,funding:false})).toMatchObject({top10Pct:20,devPct:10,sniperCount:1,bundledPct:null,insidersPct:null,freshWalletsPct:null});
});
it('excludes small contracts while retaining exact EIP-7702 delegated EOAs',()=>{
 expect(bscWalletIsContract('0x')).toBe(false);expect(bscWalletIsContract('0xef0100'+'11'.repeat(20))).toBe(false);
 expect(bscWalletIsContract('0x6000')).toBe(true);expect(bscWalletIsContract('0x'+'11'.repeat(23))).toBe(true);
});
it('distinguishes unsupported funding history from unknown or valid first funding',async()=>{
 expect(await firstFunding('https://rpc.invalid',buyer,100n,async()=>new Response('',{status:400}))).toEqual({status:'unsupported'});
 expect(await firstFunding('https://rpc.invalid',buyer,100n,async()=>Response.json({id:1,result:{transfers:[]}}))).toEqual({status:'unknown'});
 const tx={from:dev,to:buyer,blockNum:'0x64',metadata:{blockTimestamp:'2026-11-19T00:00:00Z'}};
 expect(await firstFunding('https://rpc.invalid',buyer,100n,async()=>Response.json({id:1,result:{transfers:[tx]}}))).toMatchObject({status:'known',funder:dev});
 expect(await firstFunding('https://rpc.invalid',buyer,99n,async()=>Response.json({id:1,result:{transfers:[tx]}}))).toEqual({status:'unknown'});
});
