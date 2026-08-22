import test from 'node:test';
import assert from 'node:assert/strict';
import { createRollout } from './rollout.mjs';

test('returns initial configuration', () => {
  const rollout = createRollout({ color: 'blue' }, () => 0);
  assert.deepEqual(rollout.configFor('u1'), { color: 'blue' });
});
