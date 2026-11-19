import {notFound} from 'next/navigation';
import {BscMarkets} from '@/components/terminal/bsc-markets';
export const metadata={title:'BNB Finalized Activity · CLASHR'};
export default async function IndexedBscTokenPage({params}:{params:Promise<{address:string}>}){
  const {address}=await params;
  if(!/^0x[0-9a-fA-F]{40}$/.test(address))notFound();
  return <BscMarkets address={address.toLowerCase()}/>;
}
