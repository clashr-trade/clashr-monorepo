import { getPublicBscMarket } from '../../../../lib/bsc-public-market';
export async function GET() {
  try { return Response.json(await (BNB_PRODUCT?getFourMemeMarket():getPublicBscMarket()),{headers:{'cache-control':`public, s-maxage=${BNB_PRODUCT?15:30}`}}); }
  catch { return Response.json({error:'bsc_public_market_unavailable'},{status:503,headers:{'cache-control':'no-store'}}); }
}
import {BNB_PRODUCT} from '@/lib/product';
import {getFourMemeMarket} from '@/lib/fourmeme-market';
