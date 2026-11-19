/**
 * Two hosts, one Worker: the landing and legal pages live on rushr.trade, the terminal on app.rushr.trade
 * (middleware.ts routes between them). Set NEXT_PUBLIC_APP_URL in production builds; without it (local dev)
 * app links stay relative, so one dev server serves both.
 */
import {BNB_PRODUCT} from './product';
import {BRAND_ORIGIN} from './brand';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || (BNB_PRODUCT?BRAND_ORIGIN:'https://rushr.trade');
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

/** A terminal link from the landing: absolute to the app host in production, relative locally. */
export const appHref = (path: string) => `${APP_URL}${path}`;
