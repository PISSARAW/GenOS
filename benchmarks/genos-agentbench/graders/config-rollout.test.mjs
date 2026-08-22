import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.env.TARGET_DIR;
if (!target) throw new Error('TARGET_DIR is required');
const { createRollout } = await import(pathToFileURL(path.join(target, 'rollout.mjs')));
const hash = (id) => Number(id.slice(1));

test('uses deterministic percentage boundary', () => {
  const rollout = createRollout({ v: 1 }, hash); rollout.publish({ version: 2, percentage: 25, values: { v: 2 } });
  assert.equal(rollout.configFor('u24').v, 2); assert.equal(rollout.configFor('u25').v, 1);
});
test('normalizes hash modulo one hundred', () => {
  const rollout = createRollout({ v: 1 }, () => 224); rollout.publish({ version: 2, percentage: 25, values: { v: 2 } });
  assert.equal(rollout.configFor('x').v, 2);
});
test('publish invalidates cached assignments', () => {
  const rollout = createRollout({ v: 1 }, () => 0); assert.equal(rollout.configFor('u').v, 1);
  rollout.publish({ version: 2, percentage: 100, values: { v: 2 } }); assert.equal(rollout.configFor('u').v, 2);
});
test('rollback selects one version and invalidates cache', () => {
  const rollout = createRollout({ v: 1 }, () => 0); rollout.publish({ version: 2, percentage: 100, values: { v: 2 } });
  assert.equal(rollout.configFor('u').v, 2); rollout.rollback(1); assert.equal(rollout.configFor('u').v, 1);
});
test('rejects non-monotonic or invalid releases atomically', () => {
  const rollout = createRollout({ v: 1 }, () => 0); const before = rollout.history();
  assert.throws(() => rollout.publish({ version: 1, percentage: 50, values: { v: 9 } }));
  assert.throws(() => rollout.publish({ version: 2, percentage: 101, values: { v: 9 } }));
  assert.deepEqual(rollout.history(), before); assert.equal(rollout.configFor('u').v, 1);
});
test('rollback of missing version is atomic', () => {
  const rollout = createRollout({ v: 1 }, () => 0); assert.throws(() => rollout.rollback(99));
  assert.equal(rollout.configFor('u').v, 1); assert.equal(rollout.history().length, 1);
});
test('defensively copies inputs and outputs', () => {
  const initial = { nested: { v: 1 } }; const rollout = createRollout(initial, () => 0); initial.nested.v = 9;
  const first = rollout.configFor('u'); first.nested.v = 8; assert.equal(rollout.configFor('u').nested.v, 1);
});
test('history is detached and preserves releases across rollback', () => {
  const rollout = createRollout({ v: 1 }, () => 0); rollout.publish({ version: 2, percentage: 100, values: { v: 2 } }); rollout.rollback(1);
  const history = rollout.history(); assert.deepEqual(history.map((entry) => entry.version), [1, 2]); history[0].values.v = 9;
  assert.equal(rollout.configFor('u').v, 1);
});
