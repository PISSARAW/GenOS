'use strict';

const assert = require('node:assert/strict');
const { runProcedure } = require('../src/services/agents/deterministicWorkerProcedures');
const { runVerification } = require('../src/services/agents/deterministicWorkerVerifier');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { assertAssignmentMatches } = require('../src/services/agents/workerContractEnforcement');
const { applyWorkerRuntimeLimits, assertWorkerExecutorAvailable } = require('../src/services/agents/workerRuntimeLimitsService');
const { applyTopologyWorkerKinds } = require('../src/services/topologyWorkerKindService');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const procedure = { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
const candidateReceipt = runProcedure(procedure).receipt;
const methodContract = { version: 1, methodId: 'verify_procedure', parameters: { procedure, candidateReceipt } };
const accepted = runVerification(methodContract);
assert.equal(accepted.verdict, 'accept');
assert.equal(accepted.expectedReceipt.id, candidateReceipt.id);
const rejected = runVerification({ ...methodContract, parameters: { ...methodContract.parameters,
  candidateReceipt: { ...candidateReceipt, result: { found: false } }
} });
assert.equal(rejected.verdict, 'reject');
assert.equal(rejected.evidence[0], candidateReceipt.id);

const contract = buildWorkerContract('verifier_worker', { methodContract });
const mission = { workerKind: 'verifier_worker', methodContract, workerContract: contract, timeoutMs: 500000 };
assert.doesNotThrow(() => assertWorkerExecutorAvailable(mission));
assert.equal(applyWorkerRuntimeLimits(mission, { tokens: 5000, latencyMs: 500000 }).tokens, 0);
assert.equal(mission.timeoutMs, 300000);
assert.throws(() => assertAssignmentMatches(contract, { methodContract: { ...methodContract, parameters: {
  ...methodContract.parameters, candidateReceipt: { ...candidateReceipt, id: 'forged' }
} } }), { code: 'WORKER_METHOD_MISMATCH' });
assert.equal(applyTopologyWorkerKinds('test', [{ role: 'verifier', methodContract }])[0].workerKind, 'verifier_worker');
assert.throws(() => assertWorkerExecutorAvailable({ workerKind: 'verifier_worker', methodContract: {
  version: 1, methodId: 'verify_procedure', parameters: {}
} }), { code: 'WORKER_VERIFICATION_INPUT_INVALID' });

const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const report = reportFor('verifier_worker', accepted);
assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
  agentId: 'verifier', workerContract: contract
}), true);
console.log('Deterministic verifier worker: PASS');
