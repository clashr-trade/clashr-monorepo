/**
 * Stable wire names from before the Clashr source rename. Keep these values so
 * current tabs, persisted settings, wallet sessions and activity journals survive.
 * Product source imports Clashr-facing names instead of embedding old prefixes.
 */
export const storageKey = (suffix: string): string => `rushr.${suffix}`;
export const BNB_SESSION_COOKIE = 'rushr_bnb_session';
export const TRADE_EVENT = 'rushr:trade';
export const CALL_POSTED_EVENT = 'rushr:call-posted';
export const FOLLOW_CHANGED_EVENT = 'rushr:follow-changed';
