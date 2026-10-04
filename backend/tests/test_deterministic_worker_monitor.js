'use strict';

const assert = require('node:assert/strict');
const { runMonitor } = require('../src/services/agents/deterministicWorkerMonitor');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { applyWorkerRuntimeLimits, assertWorkerExecutorAvailable } = require('../src/services/agents/workerRuntimeLimitsService');
const { applyTopologyWorkerKinds } = require('../src/services/topologyWorkerKindService');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const samples = [
  { value: 4, observedAt: '2026-10-04T10:00:00Z', sourceRef: 'sensor://test/1' },
  { value: 12, observedAt: '2026-10-04T10:01:00Z', sourceRef: 'sensor://test/2' }
];
const methodContract = { version: 1, methodId: 'monitor_samples', parameters: {
  territoryId: 'test-sensor', threshold: 10, samples
} };
const result = runMonitor(methodContract);
assert.equal(result.anomalies.length, 1);
assert.equal(result.anomalies[0].value, 12);
assert.equal(result.territoryReport.observedAt, '2026-10-04T10:01:00.000Z');
assert.throws(() => runMonitor({ ...methodContract, parameters: { ...methodContract.parameters,
  samples: [samples[0], { ...samples[1], sourceRef: samples[0].sourceRef }] } }),
{ code: 'WORKER_MONITOR_INPUT_INVALID' });

const contract = buildWorkerContract('resident_daemon', { methodContract });
const mission = { workerKind: 'resident_daemon', methodContract, workerContract: contract };
assert.doesNotThrow(() => assertWorkerExecutorAvailable(mission));
assert.equal(applyWorkerRuntimeLimits(mission, { tokens: 5000, latencyMs: 500000 }).tokens, 0);
assert.equal(applyTopologyWorkerKinds('test', [{ role: 'resident_daemon', capabilities: ['observe', 'execute'],
  methodContract }])[0].workerKind, 'resident_daemon');
const report = reportFor('resident_daemon', result);
assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
  agentId: 'monitor', workerContract: contract
}), true);
console.log('Deterministic resident daemon: PASS');
