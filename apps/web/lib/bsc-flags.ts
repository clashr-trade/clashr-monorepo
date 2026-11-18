/** Pure build-time gate; importing it must not load wallet clients or a signing SDK. */
export function bscSigningEnabled() {
  // BSC uses the user's external wallet; the global preview guard still protects shared API writes.
  return process.env.NEXT_PUBLIC_BSC_SWAP_ENABLED === '1';
}
