import { notFound } from 'next/navigation';
import { BscTokenView } from '@/components/terminal/bsc-token-view';
import { getPublicBscToken,getPublicBscCandles } from '@/lib/bsc-public-market';
export const metadata = { title: 'BNB Token · Rushr' };
export const dynamic='force-dynamic';
export default async function BscTokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) notFound();
  const [detail,candles]=await Promise.all([getPublicBscToken(address.toLowerCase()),getPublicBscCandles(address.toLowerCase(),'1m').catch(()=>[])]);
  if(!detail)notFound();
  return <BscTokenView detail={detail} candles={candles}/>;
}
