const assert = require('node:assert/strict');
const biocenose = require('../src/services/biocenoseService');

const composition = biocenose.composeBiocenose('Design a resilient distributed cache.');
assert.equal(composition.mode, 'biocenose');
assert.equal(composition.members.length, 4);
assert.equal(composition.organization, 'blind_adversarial_review');
assert.ok(composition.capabilityContract.required.includes('QUORUM'));
assert.ok(composition.capabilityContract.required.includes('EPISTEMICS_BRIER'));
assert.ok(composition.capabilityContract.required.includes('ARENA_COMPETITION'));

const dossiers = [
  { workerId: 'a', name: 'A', role: 'independent_solver', provider: 'p1', events: [{ action: 'EXECUTE', evidenceReport: { outcome: 'success', coverage: 0.9, claims: [{ statement: 'Solution A is correct and verified by tests.', evidence: ['test'] }] } }] },
  { workerId: 'b', name: 'B', role: 'adversarial_reviewer', isCandidate: true, provider: 'p2', events: [{ action: 'VERIFY', evidenceReport: { outcome: 'success', coverage: 0.4, claims: [{ statement: 'Solution B challenges A assumptions.', evidence: ['audit'] }] } }] },
  { workerId: 'c', name: 'C', role: 'consensus_observer', candidateType: 'solution', provider: 'p3', events: [{ action: 'OBSERVE', evidenceReport: { outcome: 'success', claims: [{ statement: '[ ]' }] } }] }
];
const community = biocenose.evaluateCommunity(dossiers);
assert.equal(Object.hasOwn(community, 'consensus'), false);
assert.equal(community.arenaRecommendation, null, 'one candidate must not be presented as a collective recommendation');
assert.equal(community.candidateCount, 1, 'reviewer and observer dossiers are not arena candidates');
assert.equal(community.organization, 'blind_adversarial_review');
assert.ok(Array.isArray(community.leaderboard) && community.leaderboard.length >= 1);
assert.ok(community.diversity && typeof community.diversity.effectiveDiversity === 'number');
assert.equal(community.independence.measured, false);

const largerCommunity = biocenose.composeBiocenose('Independent community', {
  population: { generators: 3, reviewers: 2, verifiers: 2 }
});
assert.equal(largerCommunity.members.filter((member) => member.role === 'generator').length, 3);
assert.equal(largerCommunity.members.filter((member) => member.role === 'reviewer').length, 2);
assert.equal(largerCommunity.members.filter((member) => member.role === 'verifier').length, 2);

const empty = biocenose.evaluateCommunity([]);
assert.equal(empty.organization, 'blind_adversarial_review');
assert.equal(empty.arenaRecommendation, null);
assert.equal(empty.candidateCount, 0);

assert.throws(() => biocenose.composeBiocenose(''), (error) => error.code === 'BIOCENOSE_MISSION_REQUIRED');
console.log('Biocenose wiring checks: PASS');
