'use strict';

const assert = require('node:assert/strict');
const deadline = require('../src/services/agentRecovery/recoveryDeadline');
assert.equal(deadline.remaining({}, 1000), null);
assert.equal(deadline.remaining({ executionDeadlineAt: 'invalid' }, 1000), 0);
assert.equal(deadline.remaining({ executionDeadlineAt: new Date(3000).toISOString() }, 1000), 2000);
assert.equal(deadline.remaining({ executionDeadlineAt: new Date(1000).toISOString() }, 3000), 0);
assert.equal(deadline.remaining({ executionDeadlineAt: 3000 }, 1000), 2000);
assert.equal(deadline.remaining({ executionDeadlineAt: 1000 }, 3000), 0);
assert.equal(deadline.remaining({ executionDeadlineAt: 0 }, 1000), 0);
assert.equal(deadline.remaining({ executionDeadlineAt: NaN }, 1000), 0);
assert.equal(deadline.remaining({ executionDeadlineAt: Infinity }, 1000), 0);
for (const value of [1793797277519, 1793797432392]) {
  const at = value - 75000;
  assert.equal(deadline.remaining({ executionDeadlineAt: value }, at), 75000);
  assert.equal(deadline.remaining({ executionDeadlineAt: new Date(value).toISOString() }, at), 75000);
}
const lifecycle = require('../src/services/agents/workerNativeLifecycle');
const clock = Date.now;
Date.now = () => 1000;
try {
  for (const executionDeadlineAt of [3000, new Date(3000).toISOString()]) {
    assert.equal(lifecycle.executionContext({}, { timeoutMs: 5000, executionDeadlineAt }).deadline, 3000);
  }
  assert.throws(() => lifecycle.executionContext({}, { executionDeadlineAt: 'invalid' }), { code: 'WORKER_DEADLINE_INVALID' });
  assert.throws(() => lifecycle.assertActive(lifecycle.executionContext({}, { executionDeadlineAt: 500 })),
    { code: 'WORKER_DEADLINE_EXCEEDED' });
} finally { Date.now = clock; }
console.log('Worker recovery deadline checks passed.');
