/**
 * Optional extra origin for reaching the development server by address instead of localhost,
 * e.g. DEV_ALLOWED_ORIGIN=http://203.0.113.5:3000 when it runs on a remote machine. Treated like
 * localhost (no https redirect or HSTS, allowed RPC origin). Production builds always ignore it.
 */
export function devAllowedOrigin(): URL | null {
  const raw = process.env.DEV_ALLOWED_ORIGIN;
  if (!raw || process.env.NODE_ENV === 'production') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
