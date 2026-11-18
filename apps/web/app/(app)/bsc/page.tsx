import { BscTrenches } from '@/components/terminal/bsc-trenches';
import { getPublicBscMarket } from '@/lib/bsc-public-market';
export const metadata = { title: 'BNB Markets · Rushr' };
export const dynamic='force-dynamic';
export default async function BscPage() {
  const market=await getPublicBscMarket().catch(()=>null);
  return <BscTrenches initial={market} serverNow={Date.now()}/>;
}
