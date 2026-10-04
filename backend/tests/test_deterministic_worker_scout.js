'use strict';

const assert = require('node:assert/strict');
const { runScout } = require('../src/services/agents/deterministicWorkerScout');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { applyWorkerRuntimeLimits, assertWorkerExecutorAvailable } = require('../src/services/agents/workerRuntimeLimitsService');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const methodContract = { version: 1, methodId: 'scan_literal', parameters: {
  sources: [{ sourceRef: 'corpus://test/1', text: 'status=ok timeout=30' }], terms: ['timeout']
} };
const result = runScout(methodContract);
assert.equal(result.observations[0].offset, 10);
assert.equal(result.observations[0].confidence, 1);
assert.deepEqual(result.observations[0].sourceRefs, ['corpus://test/1']);
assert.equal(runScout({ ...methodContract, parameters: {
  sources: [{ sourceRef: 'corpus://test/unicode', text: 'İ timeout=30' }], terms: ['timeout']
} }).observations[0].offset, 2);
assert.equal(runScout({ ...methodContract, parameters: {
  sources: [{ sourceRef: 'corpus://test/case', text: 'Timeout=30' }], terms: ['timeout']
} }).observations.length, 0);
assert.throws(() => runScout({ ...methodContract, parameters: { sources: [
  methodContract.parameters.sources[0], methodContract.parameters.sources[0]], terms: ['timeout'] } }),
{ code: 'WORKER_SCOUT_INPUT_INVALID' });
const contract = buildWorkerContract('scout_cell', { methodContract });
const mission = { workerKind: 'scout_cell', methodContract, workerContract: contract };
assert.doesNotThrow(() => assertWorkerExecutorAvailable(mission));
assert.equal(applyWorkerRuntimeLimits(mission, { tokens: 5000, latencyMs: 500000 }).tokens, 0);
const report = reportFor('scout_cell', result);
assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
  agentId: 'scout', workerContract: contract
}), true);
console.log('Deterministic scout cell: PASS');
