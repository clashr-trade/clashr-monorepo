/** BNB serves landing and terminal routes together; legacy deployments may use two hosts. */
import {BNB_PRODUCT} from './product';
import {BRAND_ORIGIN} from './brand';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || (BNB_PRODUCT?BRAND_ORIGIN:'https://rushr.trade');
/** Keep BNB links and media on the active frontend, including localhost and Vercel previews.
 * NEXT_PUBLIC_APP_URL is retained only for the legacy split-host deployment. */
export const APP_URL = BNB_PRODUCT ? '' : (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
export const appHref = (path: string) => APP_URL + path;
