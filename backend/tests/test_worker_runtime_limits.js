'use strict';

const assert = require('node:assert/strict');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { assertWorkerExecutorAvailable, applyWorkerRuntimeLimits } = require('../src/services/agents/workerRuntimeLimitsService');

const bounded = { workerKind: 'bounded_worker', workerContract: buildWorkerContract('bounded_worker'), timeoutMs: 900000 };
const budget = applyWorkerRuntimeLimits(bounded, { tokens: 20000, latencyMs: 900000 });
assert.deepEqual(budget, { tokens: 8000, latencyMs: 300000 });
assert.equal(bounded.timeoutMs, 300000);
assert.equal(bounded.executionBudget.tokens, 8000);

const daemon = { workerKind: 'resident_daemon', workerContract: buildWorkerContract('resident_daemon'), timeoutMs: 3600000 };
applyWorkerRuntimeLimits(daemon, { tokens: 8000, latencyMs: 3600000 });
assert.equal(daemon.timeoutMs, 1800000);

for (const workerKind of ['procedural_executor', 'formal_worker']) {
  const mission = { workerKind, workerContract: buildWorkerContract(workerKind) };
  assert.throws(() => assertWorkerExecutorAvailable(mission), { code: 'WORKER_EXECUTOR_UNAVAILABLE' });
  assert.throws(() => applyWorkerRuntimeLimits(mission, { tokens: 1000, latencyMs: 300000 }), {
    code: 'WORKER_EXECUTOR_UNAVAILABLE'
  });
}

console.log('Worker runtime ceilings and unavailable deterministic runners: PASS');
