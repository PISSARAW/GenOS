'use strict';

const assert = require('node:assert/strict');
const { runProcedure } = require('../src/services/agents/deterministicWorkerProcedures');
const { runRed } = require('../src/services/agents/deterministicWorkerRed');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { applyWorkerRuntimeLimits, assertWorkerExecutorAvailable } = require('../src/services/agents/workerRuntimeLimitsService');
const { applyTopologyWorkerKinds } = require('../src/services/topologyWorkerKindService');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const procedure = { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
const receipt = runProcedure(procedure).receipt;
const methodContract = { version: 1, methodId: 'falsify_procedure', parameters: {
  procedure, candidateReceipt: { ...receipt, result: { found: false } }
} };
const falsified = runRed(methodContract);
assert.equal(falsified.verdict, 'reject');
assert.equal(falsified.counterexample.recomputed.found, true);
assert.equal(falsified.counterexample.submitted.found, false);
assert.equal(falsified.expectedReceipt.id, receipt.id);
const unfalsified = runRed({ ...methodContract, parameters: { procedure, candidateReceipt: receipt } });
assert.equal(unfalsified.verdict, 'unresolved');
assert.equal(unfalsified.counterexample, null);

const contract = buildWorkerContract('red_worker', { methodContract });
const mission = { workerKind: 'red_worker', methodContract, workerContract: contract, timeoutMs: 500000 };
assert.doesNotThrow(() => assertWorkerExecutorAvailable(mission));
assert.equal(applyWorkerRuntimeLimits(mission, { tokens: 5000, latencyMs: 500000 }).tokens, 0);
assert.equal(applyTopologyWorkerKinds('test', [{ role: 'red_team', methodContract }])[0].workerKind, 'red_worker');
assert.throws(() => assertWorkerExecutorAvailable({ workerKind: 'red_worker', methodContract: {
  version: 1, methodId: 'falsify_procedure', parameters: {}
} }), { code: 'WORKER_VERIFICATION_INPUT_INVALID' });

const report = reportFor('red_worker', falsified);
assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
  agentId: 'red', workerContract: contract
}), true);
const unresolvedReport = reportFor('red_worker', unfalsified);
assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: unresolvedReport }] }, {
  agentId: 'red', workerContract: contract
}), true);
console.log('Deterministic red worker: PASS');
