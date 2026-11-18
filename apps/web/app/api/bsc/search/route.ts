import {getPublicBscMarket,getPublicBscToken} from '../../../../lib/bsc-public-market';
import {BNB_PRODUCT} from '@/lib/product';
import {getFourMemeMarket,getBnbProductToken} from '@/lib/fourmeme-market';
export async function GET(request:Request) {
  const query=(new URL(request.url).searchParams.get('q')??'').trim();
  if(query.length<2||query.length>64)return Response.json({tokens:[]});
  try{
    if(/^0x[0-9a-fA-F]{40}$/.test(query)){
      const detail=await (BNB_PRODUCT?getBnbProductToken(query):getPublicBscToken(query));
      return Response.json({chainId:56,tokens:detail?[detail.token]:[]});
    }
    const market=await (BNB_PRODUCT?getFourMemeMarket():getPublicBscMarket());
    return Response.json({chainId:56,tokens:market.tokens.filter(t=>`${t.symbol} ${t.name} ${t.address}`.toLowerCase().includes(query.toLowerCase())).slice(0,12)});
  }catch{return Response.json({error:'bsc_search_unavailable'},{status:503});}
}
