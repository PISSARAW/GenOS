import assert from 'node:assert/strict';
import { executeNodeFallback } from './nodeCliFallback.js';

const created = JSON.parse(await executeNodeFallback(['snapshot'], { agent: 'test', out: 'snapshot.json' }));
assert.equal(created.success, false);
assert.equal(created.status, 'capability_unavailable');
assert.equal(created.fallbackUsed, true);

const replay = JSON.parse(await executeNodeFallback(['replay'], { snapshot: 'snapshot.json' }));
assert.equal(replay.success, false);
assert.equal(replay.status, 'simulated');
assert.equal(replay.simulated, true);

const capsule = JSON.parse(await executeNodeFallback(['capsule'], { snapshot_id: 'snap_123' }));
assert.equal(capsule.success, false);
assert.equal(capsule.status, 'capability_unavailable');

const init = JSON.parse(await executeNodeFallback(['init'], {}));
assert.equal(init.success, false);
assert.equal(init.status, 'capability_unavailable');

const merge = JSON.parse(await executeNodeFallback(['merge', 'branch-a'], { branch_id: 'branch-a' }));
assert.equal(merge.success, false);
assert.equal(merge.status, 'capability_unavailable');

console.log('Node fallback reports only verified operations as successful.');
