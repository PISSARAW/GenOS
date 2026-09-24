'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createEpistemicSession('Share claims with their evidence and counter-evidence.');
  await assert.rejects(() => syncytium.addEpistemicEvidence(session.sessionId, {
    opId: 'evidence-before-claim', actorId: 'analyst', claimId: 'claim-1', evidenceId: 'ev-1',
    kind: 'test_result', payload: { result: 'pass' }
  }), (error) => error.code === 'SYNCYTIUM_SEMANTIC_CONFLICT'
    && error.conflicts[0].type === 'EPISTEMIC_CLAIM_REFERENCE_MISSING');

  await syncytium.addEpistemicClaim(session.sessionId, {
    opId: 'claim-1-op', actorId: 'analyst', claimId: 'claim-1', claimType: 'factual',
    statement: 'The parser accepts valid nested expressions.', provenance: { source: 'suite-17' }
  });
  await syncytium.addEpistemicEvidence(session.sessionId, {
    opId: 'evidence-1-op', actorId: 'verifier', claimId: 'claim-1', evidenceId: 'evidence-1',
    kind: 'test_result', payload: { result: 'pass', hash: 'sha256:abc' }
  });
  await syncytium.addEpistemicRefutation(session.sessionId, {
    opId: 'refutation-1-op', actorId: 'reviewer', claimId: 'claim-1', evidenceId: 'refute-1',
    kind: 'replay', payload: { result: 'counterexample', path: 'fixtures/nested-invalid.json' }
  });
  await syncytium.recordEpistemicUncertainty(session.sessionId, {
    opId: 'uncertainty-1-op', actorId: 'analyst', claimId: 'claim-1', estimate: 0.35, method: 'evidence-balance'
  });

  const state = await syncytium.epistemicSnapshot(session.sessionId);
  assert.equal(state.epistemic.claims.length, 1);
  assert.equal(state.epistemic.evidence[0].evidenceId, 'evidence-1');
  assert.equal(state.epistemic.refutations[0].evidenceId, 'refute-1');
  assert.equal(state.epistemic.uncertainty[0].estimate, 0.35);
  assert.equal(state.shared.sharedFields.claims[0].statement, 'The parser accepts valid nested expressions.');

  await assert.rejects(() => syncytium.addEpistemicClaim(session.sessionId, {
    opId: 'claim-invalid', actorId: 'analyst', claimId: 'claim-invalid', claimType: 'unknown', statement: 'x'
  }), (error) => error.code === 'SYNCYTIUM_EPISTEMIC_ENTRY_INVALID');
  await assert.rejects(() => syncytium.recordEpistemicUncertainty(session.sessionId, {
    opId: 'uncertainty-invalid', actorId: 'analyst', claimId: 'claim-1', estimate: 1.2
  }), (error) => error.code === 'SYNCYTIUM_EPISTEMIC_ENTRY_INVALID');
}

main().then(() => console.log('Syncytium epistemic variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
