import {proxyProduct} from '@/lib/product-proxy';
export const dynamic='force-dynamic';
async function handle(request:Request,{params}:{params:Promise<{path:string[]}>}){
  return proxyProduct(request,(await params).path,process.env.PRODUCT_API_URL);
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
