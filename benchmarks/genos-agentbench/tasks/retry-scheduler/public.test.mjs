import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from './scheduler.mjs';

test('enqueues and claims', () => {
  let clock = 0;
  const scheduler = createScheduler({ now: () => clock });
  scheduler.enqueue('a', { work: 1 });
  assert.equal(scheduler.claim('w')[0].id, 'a');
});
