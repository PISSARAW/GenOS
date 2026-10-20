'use strict';

const assert = require('node:assert/strict');
const contract = require('../src/services/studioInterfaceEvolution/contract');

function baseline() {
  return contract.createBaseline({
    interfaceId: 'studio-console', interfaceVersion: 3, worldId: 'production-current', createdBy: 'designer-a',
    intent: { version: 2, payload: { jobs: ['inspect'], constraints: ['keyboard'], successCriteria: ['task-completion'] } },
    designSystem: { version: 7, payload: { tokens: { spacing: 8 }, components: ['button'] } },
    evidenceRefs: ['research://interviews/42']
  });
}

function candidate(base = baseline()) {
  return contract.createCandidate({
    candidateId: 'compact-navigation', baseline: base, worldId: 'counterfactual-nav-b',
    artifactRef: 'artifact://nav-b/index.html', intentVersion: 2, designSystemVersion: 7,
    createdBy: 'builder-b', evidenceRefs: ['snapshot://nav-b']
  });
}

function contractTests() {
  const first = baseline();
  assert.equal(first.baselineHash, baseline().baselineHash);
  assert.equal(candidate(first).deploymentAuthorized, false);
  assert.throws(() => candidate({ ...first, worldId: 'counterfactual-nav-b' }), /CANDIDATE_WORLD_NOT_ISOLATED/);
  assert.throws(() => contract.createCandidate({ candidateId: 'stale', baseline: first, worldId: 'world-stale',
    artifactRef: 'artifact://stale', intentVersion: 1, designSystemVersion: 7,
    createdBy: 'builder', evidenceRefs: ['test://stale'] }), /INTENT_VERSION_CONFLICT/);
}

contractTests();
console.log('Studio interface evolution: versioned contract and isolated candidates passed');
module.exports = { baseline, candidate };
