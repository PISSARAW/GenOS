'use strict';

const assert = require('node:assert/strict');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { assertWorkerExecutorAvailable, applyWorkerRuntimeLimits } = require('../src/services/agents/workerRuntimeLimitsService');
const { normalizeMissionBudgets } = require('../src/services/agentRuntimeAdapter/missionBootstrap');

const bounded = { workerKind: 'bounded_worker', workerContract: buildWorkerContract('bounded_worker'), timeoutMs: 900000 };
const budget = applyWorkerRuntimeLimits(bounded, { tokens: 20000, latencyMs: 900000 });
assert.deepEqual(budget, { tokens: 8000, latencyMs: 540000, cpuMs: 540000 });
assert.equal(bounded.timeoutMs, 540000);
assert.equal(bounded.executionBudget.tokens, 8000);
assert.equal(bounded.executionBudget.cpuMs, 540000);

const forensic = buildWorkerContract('forensic_worker');
assert.equal(forensic.resources.maxCpuMs, forensic.resources.maxTimeMs,
  'model workers can use their full runtime window as aggregate process-tree CPU');

const redReviewer = buildWorkerContract('red_worker');
assert.equal(redReviewer.resources.maxTimeMs, 540000,
  'red reviewers retain the bounded wall-clock deadline');
assert.equal(redReviewer.resources.maxCpuMs, 1500000,
  'red reviewers have a separate aggregate CPU allowance for parallel descendants');

const smallerCpuBudget = { workerKind: 'bounded_worker', workerContract: buildWorkerContract('bounded_worker'),
  executionBudget: { cpuMs: 1200 } };
assert.equal(applyWorkerRuntimeLimits(smallerCpuBudget, { tokens: 8000, latencyMs: 300000 }).cpuMs, 1200);
const zeroCpuBudget = { workerKind: 'bounded_worker', workerContract: buildWorkerContract('bounded_worker'),
  executionBudget: { cpuMs: 0 } };
assert.equal(applyWorkerRuntimeLimits(zeroCpuBudget, { tokens: 8000, latencyMs: 300000 }).cpuMs, 0);

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

const mathMethod = { version: 1, methodId: 'compute_integral', parameters: { terms: [2, 3, 5] } };
const deterministic = { workerKind: 'math_worker', methodContract: mathMethod,
  executionBudget: { tokens: 0, costUsd: 1, latencyMs: 60000, events: 100 }, timeoutMs: 60000 };
deterministic.workerContract = buildWorkerContract('math_worker', deterministic);
const deterministicContext = { normalizedMission: deterministic };
normalizeMissionBudgets(deterministicContext);
assert.equal(deterministicContext.normalizedExecutionBudget.tokens, 0,
  'sealed native workers admit their explicit zero-token budget');

console.log('Worker runtime ceilings and unavailable deterministic runners: PASS');
