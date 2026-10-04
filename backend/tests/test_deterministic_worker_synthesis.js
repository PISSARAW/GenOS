'use strict';

const assert = require('node:assert/strict');
const { runSynthesis } = require('../src/services/agents/deterministicWorkerSynthesis');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { applyWorkerRuntimeLimits, assertWorkerExecutorAvailable } = require('../src/services/agents/workerRuntimeLimitsService');
const { applyTopologyWorkerKinds } = require('../src/services/topologyWorkerKindService');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const sources = [
  { sourceRef: 'source://test/a', claim: 'Deployment is safe.', position: 'yes' },
  { sourceRef: 'source://test/b', claim: 'Deployment is safe.', position: 'no' }
];
const methodContract = { version: 1, methodId: 'synthesize_claims', parameters: { sources } };
const result = runSynthesis(methodContract);
assert.deepEqual(result.sources, sources.map((item) => item.sourceRef));
assert.deepEqual(result.disagreements, [{ claim: 'Deployment is safe.', positions: [
  { source: 'source://test/a', position: 'yes' }, { source: 'source://test/b', position: 'no' }
] }]);
assert.throws(() => runSynthesis({ ...methodContract, parameters: { sources: [sources[0],
  { ...sources[1], sourceRef: sources[0].sourceRef }] } }), { code: 'WORKER_SYNTHESIS_INPUT_INVALID' });

const contract = buildWorkerContract('synthesis_worker', { methodContract });
const mission = { workerKind: 'synthesis_worker', methodContract, workerContract: contract };
assert.doesNotThrow(() => assertWorkerExecutorAvailable(mission));
assert.equal(applyWorkerRuntimeLimits(mission, { tokens: 5000, latencyMs: 500000 }).tokens, 0);
assert.equal(applyTopologyWorkerKinds('test', [{ role: 'integration_observer', methodContract }])[0].workerKind,
  'synthesis_worker');
const report = reportFor('synthesis_worker', result);
assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
  agentId: 'synthesis', workerContract: contract
}), true);
console.log('Deterministic synthesis worker: PASS');
