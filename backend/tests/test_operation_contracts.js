'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/operationContractService');

function baseOperation() {
  return {
    schemaVersion: '1.0.0',
    operationKind: 'workflow',
    correlation: { missionId: 'm1', runId: 'r1', operationId: 'o1', eventId: 'e1', agentId: 'a1' },
    idempotencyKey: 'idem-1',
    budget: { durationMs: 1000, maxCost: 0.5, maxSteps: 3 },
    authority: { requester: 'orchestrator', leases: ['genos_execute_primitive'] }
  };
}

const operation = baseOperation();
assert.equal(service.validateOperation(operation).valid, true);
assert.equal(service.validateOperation({}).valid, false);
assert.equal(service.validateOperation({ ...operation, operationKind: 'unknown' }).valid, false);

const missingCorrelation = baseOperation();
delete missingCorrelation.correlation.eventId;
assert.equal(service.validateOperation(missingCorrelation).valid, false);

assert.equal(service.isAllowedTransition('running', 'complete'), true);
assert.equal(service.isAllowedTransition('complete', 'running'), false);
assert.equal(service.isAllowedTransition('pending', 'complete'), false);
assert.equal(service.isAllowedTransition('failed', 'running'), true);
assert.equal(service.isAllowedTransition('unknown', 'running'), false);

const receipt = service.buildReceipt(operation, {
  status: 'partial',
  reason: 'output_truncated',
  origin: 'local',
  observed: { url: 'https://example.test' },
  requested: { action: 'fetch' },
  result: { bytes: 12 },
  proofIds: ['proof_1']
});
assert.equal(service.validateReceipt(receipt).valid, true);
assert.equal(receipt.correlation.operationId, 'o1');
assert.equal(service.lineageKey(operation.correlation), 'm1/r1/o1/e1');

const noReason = { ...receipt, reason: '' };
assert.equal(service.validateReceipt(noReason).valid, false);
const completeReceipt = service.buildReceipt(operation, {
  status: 'complete',
  origin: 'external',
  observed: {},
  requested: {},
  result: {}
});
assert.equal(service.validateReceipt(completeReceipt).valid, true);

const replay = service.buildReceipt(operation, {
  status: 'partial',
  reason: 'output_truncated',
  origin: 'local',
  observed: { url: 'https://example.test' },
  requested: { action: 'fetch' },
  result: { bytes: 12 },
  proofIds: ['proof_1']
});
assert.equal(replay.idempotencyKey, receipt.idempotencyKey);
assert.equal(replay.correlation.eventId, receipt.correlation.eventId);

const evidence = {
  schemaVersion: '1.0.0',
  proofId: 'proof_1',
  correlation: operation.correlation,
  dimensions: [{ name: 'accuracy', value: 0.8, direction: 'higher', provenance: 'test_run' }]
};
assert.equal(service.validateEvidence(evidence).valid, true);
assert.equal(service.validateEvidence({ ...evidence, dimensions: [] }).valid, false);

const unknownDimension = {
  schemaVersion: '1.0.0',
  proofId: 'proof_2',
  correlation: operation.correlation,
  dimensions: [{ name: 'latency', value: null, unknown: true, direction: 'lower', provenance: 'timeout' }]
};
assert.equal(service.validateEvidence(unknownDimension).valid, true);

assert.throws(() => service.buildReceipt({}, { status: 'complete' }), /Invalid/);
assert.throws(() => service.lineageKey({}), /Invalid/);

console.log('Operation contracts: states, correlation, idempotence, evidence.');
