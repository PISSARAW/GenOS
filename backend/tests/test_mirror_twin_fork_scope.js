const assert = require('node:assert/strict');
const Module = require('node:module');

const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { handleMirrorTwinFork } = require('../src/services/mcpBioTools/handlers/mirrorTwinFork');
  const forked = handleMirrorTwinFork({ action: 'fork_mirror_pair', pair_id: 'scope-check' });
  assert.equal(forked.execution_scope, 'metadata_simulation');
  assert.equal(forked.runtime_agents_created, false);

  const evaluated = handleMirrorTwinFork({
    action: 'evaluate_polarity_equilibrium',
    pair_id: 'scope-check',
    constructive_claims: ['the feature works'],
    adversarial_critiques: []
  });
  assert.equal(evaluated.evidence_reviewed, false);
  assert.equal(evaluated.promotion_allowed, false);
  assert.equal(evaluated.arbiter_recommendation, 'MANUAL_REVIEW_REQUIRED');

  const reconciled = handleMirrorTwinFork({ action: 'reconcile_mirror', pair_id: 'scope-check', force: true });
  assert.equal(reconciled.success, false);
  assert.equal(reconciled.status, 'promotion_unavailable');
  assert.equal(reconciled.promoted_snapshot_id, undefined);

  const invalid = handleMirrorTwinFork({
    action: 'evaluate_polarity_equilibrium', pair_id: 'scope-check', constructive_claims: 'not an array'
  });
  assert.equal(invalid.status, 'invalid_args');
} finally {
  Module._load = originalLoad;
}

console.log('mirror twin simulation scope passed');
