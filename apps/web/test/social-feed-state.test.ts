import { describe, it, expect } from 'vitest';
import { mergeCallouts } from '../lib/feed/social-state';
import type { Callout } from '../lib/callouts';
const call = (id: string, time: number, body = id) =>
  ({ id, createdAt: new Date(time).toISOString(), body }) as Callout;
describe('social feed reconciliation', () => {
  it('retains a confirmed local post when an older initial fetch completes', () => {
    const posted = call('new', 2000),
      old = call('old', 1000);
    expect(mergeCallouts([posted], [old]).map((c) => c.id)).toEqual(['new', 'old']);
  });
  it('updates existing calls without duplicating rows or losing older pages', () => {
    expect(
      mergeCallouts(
        [call('new', 3000), call('same', 2000, 'updated')],
        [call('same', 2000), call('older', 1000)],
      ).map((c) => [c.id, c.body]),
    ).toEqual([
      ['new', 'new'],
      ['same', 'updated'],
      ['older', 'older'],
    ]);
  });
});
