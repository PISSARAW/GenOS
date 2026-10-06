'use strict';
const assert = require('node:assert/strict');
const fixture = require('./capability_runtime_fixture');
const bridge = require('../src/services/morphogenesis/capabilities/trinityMeristemBridge');
const waves = require('../src/services/morphogenesis/capabilities/experimentWaveRuntime');
async function run(db) {
  await require('../src/db/migrations/migrateScientificEvidenceLedger').migrateScientificEvidenceLedger(db);
  const scope = fixture.scoped(db, 'MISSION:scientific');
  const sourceRef = await fixture.proof(db, scope.scopeId, { incident: 'delivery' });
  const contract = { experimentId: 'test-scientific', hypothesisId: 'queue', verifierId: 'reviewer',
    intervention: { replay: 'delivery' }, sourceRefs: [sourceRef], tools: ['replay'], predictions: ['duplicate'],
    discriminatingOutcomes: ['duplicate', 'single'], utility: 1, cost: 1 };
  await waves.openWave(db, { ...scope, waveId: 'scientific-wave', candidates: [contract], budget: 1 });
  const ledger = require('../src/services/scientificEvidenceLedger').createScientificEvidenceLedger(db);
  await ledger.createExperiment({ experimentId: 'scientific-exp', title: 'delivery', proofLevel: 'L2',
    protocol: {}, environment: {}, topologyRefs: ['trinity'], createdBy: 'worker' });
  await ledger.recordClaim({ claimId: 'scientific-claim', experimentId: 'scientific-exp', statement: 'duplicate observed', scope: { scopeId: scope.scopeId }, createdBy: 'worker' });
  await ledger.recordEvidence({ evidenceId: 'scientific-evidence', claimId: 'scientific-claim', experimentId: 'scientific-exp',
    relation: 'SUPPORTS', sourceKind: 'isolated-trial', sourceId: 'trial', topology: 'trinity',
    evidence: { experimentId: contract.experimentId, outcome: 'duplicate' }, createdBy: 'worker' });
  await ledger.recordAssessment({ assessmentId: 'scientific-assessment', claimId: 'scientific-claim', kind: 'verifier',
    position: 'support', verifierStatus: 'verified', rationale: 'independently replayed', evidenceRefs: ['scientific-evidence'], createdBy: 'reviewer' });
  const input = { ...scope, waveId: 'scientific-wave', results: [{ assessmentId: 'scientific-assessment', experimentId: contract.experimentId, outcome: 'duplicate' }] };
  await assert.rejects(bridge.sealScientificWave(db, { ...input, results: [{ ...input.results[0], outcome: 'single' }] }), /DIGEST_INVALID/);
  const sealed = await bridge.sealScientificWave(db, input);
  assert.equal(sealed.state, 'SEALED');
  const ranked = await bridge.rankHypotheses(db, { ...scope, contracts: [contract], candidateHypotheses: [{ id: 'queue', hypothesis: 'duplicate delivery causes effects' }] });
  assert.equal(ranked.coverageReceiptCount, 1);
}
module.exports = run;
