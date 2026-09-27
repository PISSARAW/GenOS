'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/versionedContractService');

const candidate = {
  id: 'h0', parentIds: [], genome: { ontology: 'x-causes-y' }, origin: { kind: 'baseline' }, metrics: { evidence: 1 }, status: 'candidate'
};
const world = {
  stateBefore: { energy: 1 }, action: 'observe', delta: { evidenceCount: 1 }, stateAfter: { energy: 1 },
  context: { missionClass: 'validation' }, evidenceRefs: ['ev_1'], observedAt: '2026-09-27T10:00:00.000Z'
};
const rendering = {
  sentences: [{ text: 'Le test est passé.', kind: 'factual', claimIds: ['claim_1'] }],
  verification: { status: 'verified', violations: [] }
};
const causal = {
  experimentId: 'exp_1', snapshotId: 'snap_1', control: { mode: 'normal' }, intervention: { mode: 'cut' },
  seeds: [1, 2], replicates: 2, metricsBefore: { success: 1 }, metricsAfter: { success: 0 }, pairedEffects: { success: -1 },
  verdict: 'supported', evidenceRefs: ['run_1']
};

for (const [type, payload] of Object.entries({ MorphogeneticCandidate: candidate, WorldTransition: world, VerifiedRendering: rendering, CausalInterventionReceipt: causal })) {
  const receipt = service.createReceipt(type, payload, { runId: 'run_1', sourceRefs: ['source_1'] });
  assert.equal(receipt.contractVersion, 'v1');
  assert.equal(receipt.contractType, type);
  assert.equal(service.readReceipt(receipt).valid, true);
  assert.equal(service.readReceipt(structuredClone(receipt)).receiptId, receipt.receiptId);
}

const unknown = { ...candidate, extra: true };
assert.equal(service.validateContract('MorphogeneticCandidate', unknown).valid, false);
assert.throws(() => service.createReceipt('MorphogeneticCandidate', unknown), /Invalid/);
assert.equal(service.readReceipt({ ...service.createReceipt('WorldTransition', world), schema: 'genos.Other.receipt/v1' }).valid, false);
assert.equal(service.validateContract('Unknown', {}).valid, false);
assert.equal(service.validateContract('CausalInterventionReceipt', { ...causal, replicates: 1 }).valid, false);
console.log('Versioned contracts: four schemas, strict validation, stable receipts.');
