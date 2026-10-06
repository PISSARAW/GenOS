'use strict';
const assert = require('node:assert/strict');
const fixture = require('./capability_runtime_fixture');
const waves = require('../src/services/morphogenesis/capabilities/experimentWaveRuntime');
const coverage = require('../src/services/morphogenesis/capabilities/capabilityEvidenceStore');

async function run(db) {
  const scope = fixture.scoped(db, 'MISSION:wave');
  const sourceRef = await fixture.proof(db, scope.scopeId, { source: 'incident' });
  const contract = { experimentId: 'a', hypothesisId: 'queue', verifierId: 'independent',
    intervention: { probe: 'replay-delivery' }, sourceRefs: [sourceRef], tools: ['trace-replay'],
    predictions: ['duplicate'], discriminatingOutcomes: ['duplicate', 'single'],
    assumptions: ['at-least-once'], utility: 1, cost: 1 };
  await assert.rejects(waves.openWave(db, { ...scope, waveId: 'missing-source', candidates: [{ ...contract, sourceRefs: ['missing'] }], budget: 1 }), /SOURCES_UNRESOLVED/);
  const opened = await waves.openWave(db, { ...scope, waveId: 'wave', candidates: [contract], budget: 1 });
  assert.equal(opened.state, 'OPEN');
  assert.equal((await coverage.loadCoverage(db, scope.scopeId)).length, 0);
  const trialRef = await fixture.proof(db, scope.scopeId, { observed: 'duplicate' });
  const verificationRef = await fixture.artifacts.put(db, { scopeId: scope.scopeId, kind: 'experiment-verification',
    content: { valid: true, experimentId: 'a', verifierId: 'independent', outcome: 'duplicate',
      evidenceRefs: [trialRef], dissent: [{ hypothesisId: 'network', reason: 'untested' }] } });
  const result = { experimentId: 'a', verificationRef, evidenceRefs: [trialRef] };
  await assert.rejects(waves.sealWave(db, { ...scope, waveId: 'wave', results: [{ ...result, verificationRef: sourceRef }] }), /BINDING/);
  assert.equal((await coverage.loadCoverage(db, scope.scopeId)).length, 0);
  const sealed = await waves.sealWave(db, { ...scope, waveId: 'wave', results: [result] });
  assert.equal(sealed.results[0].dissent.length, 1);
  assert.equal((await coverage.loadVerifiedCoverage(db, scope)).length, 1);
  assert.equal(await fixture.artifacts.get(db, { scopeId: 'MISSION:other', ref: sealed.artifactRef }), null);
  await assert.rejects(db.run('DELETE FROM morph_capability_artifacts WHERE artifact_ref = ?', [trialRef]), /immutable/);
  await assert.rejects(waves.openWave(db, { ...scope, waveId: 'bad-replica', budget: 1,
    candidates: [{ ...contract, experimentId: 'replica', replicationOf: 'a', independentVerifierId: 'independent' }] }), /DISTINCT_VERIFIER/);
  const replica = { ...contract, experimentId: 'replica', verifierId: 'second-verifier',
    replicationOf: 'a', independentVerifierId: 'second-verifier' };
  const next = await waves.openWave(db, { ...scope, waveId: 'replica-wave', budget: 1, candidates: [replica] });
  assert.equal(next.ranked[0].inhibition, 0);
}
module.exports = run;
