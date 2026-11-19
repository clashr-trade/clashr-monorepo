import { getPublicBscMarket } from '../../../../lib/bsc-public-market';
export async function GET() {
  try { return Response.json(await (BNB_PRODUCT?getFlapMarket():getPublicBscMarket()),{headers:{'cache-control':BNB_PRODUCT?'no-store':'public, s-maxage=30'}}); }
  catch { return Response.json({error:'bsc_public_market_unavailable'},{status:503,headers:{'cache-control':'no-store'}}); }
}
import {BNB_PRODUCT} from '@/lib/product';
import {getFlapMarket} from '@/lib/flap-market';
