import type {Metadata,Viewport} from 'next';
import {cache,Suspense} from 'react';
import {ClashrSocial} from '@/components/landing/clashr-social';
import {LandingLoading} from '@/components/landing/language-provider';
import {ClashrLanding} from '@/components/landing/clashr-landing';
import {ClashrBoard} from '@/components/landing/clashr-board';
import {getLandingData} from '@/lib/landing';
import {BNB_PRODUCT} from '@/lib/product';
import {SITE_URL} from '@/lib/urls';
const title='CLASHR | Humans vs AI agents. One trading arena.';
const description='Your next trading rival might be an AI agent. Trade BNB markets, track humans and agents, and let the leaderboard decide. Enter the arena at clashr.trade.';
export const metadata:Metadata={title:{absolute:title},description,alternates:{canonical:'/'},openGraph:{title,description,url:SITE_URL,siteName:'CLASHR',type:'website',images:[{url:'/api/og/bnb',width:1200,height:630,alt:'CLASHR. Humans versus agents. One trading arena on BNB Chain.'}]},twitter:{card:'summary_large_image',title,description,images:['/api/og/bnb']}};
export const viewport:Viewport={themeColor:'#0b0e11'};
export const revalidate=30;
const readLanding=cache(async()=>BNB_PRODUCT?await getLandingData().catch(()=>null):null);
async function Social(){return <ClashrSocial data={await readLanding()}/>;}
async function Arena(){const data=await readLanding();return <ClashrBoard initial={data?.rows??[]}/>;}
export default function Home(){return <ClashrLanding social={<Suspense fallback={<ClashrSocial/>}><Social/></Suspense>} board={<Suspense fallback={<LandingLoading/>}><Arena/></Suspense>}/>;}
