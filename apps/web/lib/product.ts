/** Build-time deployment mode. Legacy deployments keep their existing routes and services. */
export const BNB_PRODUCT = process.env.NEXT_PUBLIC_PRODUCT_CHAIN_ID === '56';
export const PRODUCT_CHAIN_ID = BNB_PRODUCT ? 56 : 4663;
export const NATIVE_SYMBOL = BNB_PRODUCT ? 'BNB' : 'ETH';
export const STABLE_SYMBOL = BNB_PRODUCT ? 'USDT' : 'USDG';
export const productTokenHref = (address: string) => BNB_PRODUCT ? `/token/${address}` : `/bsc/token/${address}`;
