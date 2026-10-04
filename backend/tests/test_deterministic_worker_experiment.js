'use strict';

const assert = require('node:assert/strict');
const { runExperiment } = require('../src/services/agents/deterministicWorkerExperiment');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { applyWorkerRuntimeLimits, assertWorkerExecutorAvailable } = require('../src/services/agents/workerRuntimeLimitsService');
const { applyTopologyWorkerKinds } = require('../src/services/topologyWorkerKindService');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const methodContract = { version: 1, methodId: 'measure_lpt', parameters: {
  jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }],
  machines: 2, threshold: 7
} };
const result = runExperiment(methodContract);
assert.equal(result.measurements[0].value, 7);
assert.equal(result.conclusion, 'supported_for_this_input');
assert.equal(runExperiment({ ...methodContract, parameters: {
  ...methodContract.parameters, threshold: 6
} }).conclusion, 'refuted_for_this_input');
assert.throws(() => runExperiment({ ...methodContract, parameters: { ...methodContract.parameters,
  threshold: -1 } }), { code: 'WORKER_EXPERIMENT_INPUT_INVALID' });

const contract = buildWorkerContract('experimental_worker', { methodContract });
const mission = { workerKind: 'experimental_worker', methodContract, workerContract: contract };
assert.doesNotThrow(() => assertWorkerExecutorAvailable(mission));
assert.equal(applyWorkerRuntimeLimits(mission, { tokens: 5000, latencyMs: 500000 }).tokens, 0);
assert.equal(applyTopologyWorkerKinds('test', [{ role: 'experimenter', capabilities: ['experiment', 'measure'],
  methodContract }])[0].workerKind,
  'experimental_worker');
const report = reportFor('experimental_worker', result);
assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
  agentId: 'experiment', workerContract: contract
}), true);
console.log('Deterministic experimental worker: PASS');
