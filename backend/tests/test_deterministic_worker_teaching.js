'use strict';

const assert = require('node:assert/strict');
const { runTeaching } = require('../src/services/agents/deterministicWorkerTeaching');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { applyWorkerRuntimeLimits, assertWorkerExecutorAvailable } = require('../src/services/agents/workerRuntimeLimitsService');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const procedure = { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
const methodContract = { version: 1, methodId: 'teach_subset_sum', parameters: {
  procedure, learnerIndices: [0, 2], prerequisites: ['Integer addition']
} };
const result = runTeaching(methodContract);
assert.equal(result.transferCheck.passed, true);
assert.equal(result.transferCheck.learnerSum, 10);
assert.equal(runTeaching({ ...methodContract, parameters: { ...methodContract.parameters,
  learnerIndices: [0, 0] } }).transferCheck.passed, false);
assert.throws(() => runTeaching({ ...methodContract, parameters: { ...methodContract.parameters,
  procedure: { ...procedure, methodId: 'lpt' } } }), { code: 'WORKER_TEACHING_INPUT_INVALID' });

const contract = buildWorkerContract('teaching_worker', { methodContract });
const mission = { workerKind: 'teaching_worker', methodContract, workerContract: contract };
assert.doesNotThrow(() => assertWorkerExecutorAvailable(mission));
assert.equal(applyWorkerRuntimeLimits(mission, { tokens: 5000, latencyMs: 500000 }).tokens, 0);
const report = reportFor('teaching_worker', result);
assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
  agentId: 'teaching', workerContract: contract
}), true);
console.log('Deterministic teaching worker: PASS');
