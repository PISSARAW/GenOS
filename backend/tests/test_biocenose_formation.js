'use strict';

const assert = require('node:assert/strict');
const biocenose = require('../src/services/biocenoseService');
const { effectiveCommunitySize } = require('../src/services/biocenose/formation/effectiveCommunitySizeService');

function candidates() {
  return [
    { memberId: 'gen-a', role: 'generator', provider: 'provider-a', lineage: 'lineage-a', expertise: ['security'], strategy: ['audit'], retrievalSources: ['docs-a'], errorVectorScope: 'bench-1', errorVector: [0, 1, 1, 0] },
    { memberId: 'gen-b', role: 'generator', provider: 'provider-a', lineage: 'lineage-a', expertise: ['security'], strategy: ['audit'], retrievalSources: ['docs-a'], errorVectorScope: 'bench-1', errorVector: [0, 1, 1, 0] },
    { memberId: 'gen-c', role: 'generator', provider: 'provider-b', lineage: 'lineage-b', expertise: ['runtime', 'testing'], strategy: ['replay'], retrievalSources: ['docs-b'], errorVectorScope: 'bench-1', errorVector: [1, 0, 0, 1] },
    { memberId: 'rev-a', role: 'reviewer', provider: 'provider-c', expertise: ['security'] },
    { memberId: 'ver-a', role: 'verifier', provider: 'provider-d', tools: ['tests'] }
  ];
}

function verifyEffectiveSize() {
  const clones = ['a', 'b', 'c'].map((memberId) => ({
    memberId, errorVectorScope: 'same-benchmark', errorVector: [0, 1, 1, 0]
  }));
  assert.equal(effectiveCommunitySize(clones).effectiveSize, 1);
  assert.equal(effectiveCommunitySize([{ memberId: 'unknown' }]).measured, false);
}

function verifyFormationSelection() {
  const result = biocenose.composeBiocenose('Review the proposed architecture.', {
    population: { generators: 2, reviewers: 1, verifiers: 1 },
    memberCandidates: candidates()
  });
  assert.deepEqual(result.formation.selectedCandidateIds, ['gen-c', 'gen-a', 'rev-a', 'ver-a']);
  assert.equal(result.formation.effectiveCommunitySize.measured, false);
  assert.equal(result.formation.diversityGaps.missingRoles.length, 0);
}

verifyEffectiveSize();
verifyFormationSelection();
console.log('Biocenose formation checks: PASS');
