/** Explicit, exact-host HTTP preview for an IP-based VPS deployment. */
export function httpPreviewOrigin(): URL | null {
  try {
    const url = new URL(process.env.CLASHR_HTTP_PREVIEW_ORIGIN ?? '');
    const octets = url.hostname.split('.');
    if (url.protocol !== 'http:' || octets.length !== 4
      || octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}
