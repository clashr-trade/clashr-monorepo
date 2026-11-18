import type { Callout } from '../callouts';

/** New snapshots update existing rows while retaining already-loaded older pages. */
export function mergeCallouts(newer: Callout[], older: Callout[]): Callout[] {
  const seen = new Set<string>();
  return [...newer, ...older]
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
