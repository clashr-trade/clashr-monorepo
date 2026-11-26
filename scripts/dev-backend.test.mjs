import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runServices} from './dev-backend.mjs';

test('completed history does not terminate the live services', async () => {
  const result = await runServices([
    {name: 'history', allowSuccessfulExit: true, args: ['-e', 'process.exit(0)']},
    {name: 'live', args: ['-e', 'setTimeout(() => process.exit(7), 300)']},
  ]);
  assert.equal(result, 7);
});

test('history failures still stop the service group', async () => {
  const result = await runServices([
    {name: 'history', allowSuccessfulExit: true, args: ['-e', 'process.exit(2)']},
    {name: 'live', args: ['-e', 'setInterval(() => {}, 1000)']},
  ]);
  assert.equal(result, 2);
});
