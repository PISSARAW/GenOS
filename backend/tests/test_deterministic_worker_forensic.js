'use strict';

const assert = require('node:assert/strict');
const { runForensic } = require('../src/services/agents/deterministicWorkerForensic');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { applyWorkerRuntimeLimits, assertWorkerExecutorAvailable } = require('../src/services/agents/workerRuntimeLimitsService');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const events = [
  { id: 'deploy', occurredAt: '2026-10-04T10:00:00Z', sourceRef: 'incident://test/deploy' },
  { id: 'alert', occurredAt: '2026-10-04T10:01:00Z', sourceRef: 'incident://test/alert',
    causedBy: { eventId: 'deploy', receiptRef: 'incident://test/causation' } }
];
const methodContract = { version: 1, methodId: 'trace_declared_causes', parameters: { events } };
const result = runForensic(methodContract);
assert.deepEqual(result.causalChain[0], { from: 'deploy', to: 'alert', relation: 'declared_cause',
  evidence: ['incident://test/deploy', 'incident://test/alert', 'incident://test/causation'] });
assert.deepEqual(result.unlinkedEvents, ['deploy']);
assert.throws(() => runForensic({ ...methodContract, parameters: { events: [events[1], events[0]] } }),
{ code: 'WORKER_FORENSIC_INPUT_INVALID' });
assert.throws(() => runForensic({ ...methodContract, parameters: { events: [events[0],
  { ...events[1], occurredAt: '2026-10-04T09:59:00Z' }] } }), { code: 'WORKER_FORENSIC_INPUT_INVALID' });

const contract = buildWorkerContract('forensic_worker', { methodContract });
const mission = { workerKind: 'forensic_worker', methodContract, workerContract: contract };
assert.doesNotThrow(() => assertWorkerExecutorAvailable(mission));
assert.equal(applyWorkerRuntimeLimits(mission, { tokens: 5000, latencyMs: 500000 }).tokens, 0);
const report = reportFor('forensic_worker', result);
assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
  agentId: 'forensic', workerContract: contract
}), true);
console.log('Deterministic forensic worker: PASS');
