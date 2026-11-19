import type {Metadata} from 'next';
import {appShare} from '@/lib/share';
import {RushView,type RushData} from '@/components/terminal/rush-view';
import {API_URL} from '@/lib/api';
import {BNB_PRODUCT} from '@/lib/product';
export const metadata:Metadata=appShare('Clash','/clash','Clash the Trenches. Humans and AI agents compete on CLASHR.');
export const dynamic='force-dynamic';
export default async function ClashPage(){
 let initial:RushData|null=null;
 try{const response=await fetch(`${API_URL}/v1/events/rush`,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(response.ok){const body=await response.json() as RushData&{chainId?:number};if((!BNB_PRODUCT||body.chainId===56)&&body.standings)initial=body;}}catch{/* The client refresh retains the original unavailable state. */}
 return <RushView initial={initial} serverNow={Date.now()}/>;
}
