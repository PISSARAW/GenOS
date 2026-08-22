import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.env.TARGET_DIR;
if (!target) throw new Error('TARGET_DIR is required');
const { createScheduler } = await import(pathToFileURL(path.join(target, 'scheduler.mjs')));
const setup = (options = {}) => { let clock = 0; return { scheduler: createScheduler({ now: () => clock, leaseMs: 10, maxAttempts: 2, ...options }), tick: (n) => { clock += n; } }; };

test('orders by priority then enqueue sequence', () => {
  const { scheduler } = setup(); scheduler.enqueue('a', 1, 1); scheduler.enqueue('b', 2, 3); scheduler.enqueue('c', 3, 3);
  assert.deepEqual(scheduler.claim('w', 3).map((job) => job.id), ['b', 'c', 'a']);
});
test('rejects duplicate ids without replacement', () => {
  const { scheduler } = setup(); scheduler.enqueue('a', { x: 1 }); assert.throws(() => scheduler.enqueue('a', { x: 2 }));
  assert.deepEqual(scheduler.claim('w')[0].payload, { x: 1 });
});
test('does not expose live state from claim or snapshot', () => {
  const { scheduler } = setup(); scheduler.enqueue('a', { x: 1 }); const claimed = scheduler.claim('w')[0]; claimed.status = 'evil';
  const snap = scheduler.snapshot(); snap[0].payload.x = 9; assert.equal(scheduler.snapshot()[0].status, 'leased'); assert.equal(scheduler.snapshot()[0].payload.x, 1);
});
test('reclaims only expired leases', () => {
  const { scheduler, tick } = setup(); scheduler.enqueue('a', 1); assert.equal(scheduler.claim('w1').length, 1); assert.equal(scheduler.claim('w2').length, 0);
  tick(10); assert.equal(scheduler.claim('w2')[0].id, 'a');
});
test('rejects stale and foreign completion', () => {
  const { scheduler, tick } = setup(); scheduler.enqueue('a', 1); scheduler.claim('w1');
  assert.throws(() => scheduler.complete('a', 'w2')); tick(10); assert.throws(() => scheduler.complete('a', 'w1'));
});
test('completion is idempotent for completing worker', () => {
  const { scheduler } = setup(); scheduler.enqueue('a', 1); scheduler.claim('w'); scheduler.complete('a', 'w'); scheduler.complete('a', 'w');
  assert.equal(scheduler.snapshot()[0].status, 'completed');
});
test('failure retries then dead-letters', () => {
  const { scheduler } = setup(); scheduler.enqueue('a', 1); scheduler.claim('w'); scheduler.fail('a', 'w');
  assert.equal(scheduler.snapshot()[0].attempts, 1); scheduler.claim('w'); scheduler.fail('a', 'w');
  assert.equal(scheduler.snapshot()[0].status, 'dead'); assert.equal(scheduler.claim('w').length, 0);
});
test('expired failure cannot mutate reclaimed job', () => {
  const { scheduler, tick } = setup(); scheduler.enqueue('a', 1); scheduler.claim('w1'); tick(10); scheduler.claim('w2');
  assert.throws(() => scheduler.fail('a', 'w1')); assert.equal(scheduler.snapshot()[0].worker, 'w2');
});
