import { getPublicBscCandles } from '../../../../../../lib/bsc-public-market';
import {getBscTokenWorkspace} from '../../../../../../lib/bsc-token-workspace';
import {getFlapCandles} from '@/lib/flap-market';
import {BNB_PRODUCT} from '@/lib/product';
export async function GET(request:Request,{params}:{params:Promise<{address:string}>}) {
  const {address}=await params;
  const interval=new URL(request.url).searchParams.get('interval')??'1m';
  if(!/^0x[0-9a-fA-F]{40}$/.test(address)||!['1m','5m','15m','1h','4h'].includes(interval))return Response.json({error:'invalid_request'},{status:400});
  try{
    if(BNB_PRODUCT){
      const snapshot=await getBscTokenWorkspace(address);
      if(snapshot?.detail.source==='flap'&&!snapshot.detail.pools.length){
        return Response.json({chainId:56,source:'flap',candles:await getFlapCandles(address,interval)},{headers:{'cache-control':'public, s-maxage=15'}});
      }
    }
    return Response.json({chainId:56,source:'geckoterminal',candles:await getPublicBscCandles(address,interval)},{headers:{'cache-control':'public, s-maxage=30'}});
  }
  catch{return Response.json({error:'bsc_chart_unavailable'},{status:503});}
}
