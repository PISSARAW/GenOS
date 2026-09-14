const assert = require('node:assert/strict');
const biocenose = require('../src/services/biocenoseService');

const composition = biocenose.composeBiocenose('Design a resilient distributed cache.');
assert.equal(composition.mode, 'biocenose');
assert.equal(composition.members.length, 4);
assert.equal(composition.organization, 'brier_weighted_consensus');
assert.ok(composition.capabilityContract.required.includes('QUORUM'));
assert.ok(composition.capabilityContract.required.includes('EPISTEMICS_BRIER'));
assert.ok(composition.capabilityContract.required.includes('ARENA_COMPETITION'));

const dossiers = [
  { workerId: 'a', name: 'A', role: 'independent_solver', events: [{ action: 'EXECUTE', evidenceReport: { outcome: 'success', coverage: 0.9, claims: [{ statement: 'Solution A is correct and verified by tests.', evidence: ['test'] }] } }] },
  { workerId: 'b', name: 'B', role: 'adversarial_reviewer', events: [{ action: 'VERIFY', evidenceReport: { outcome: 'success', coverage: 0.4, claims: [{ statement: 'Solution B challenges A assumptions.', evidence: ['audit'] }] } }] },
  { workerId: 'c', name: 'C', role: 'consensus_observer', events: [{ action: 'OBSERVE', evidenceReport: { outcome: 'success', claims: [{ statement: '[ ]' }] } }] }
];
const community = biocenose.evaluateCommunity(dossiers);
assert.ok(community.consensus, 'a knee-point consensus is expected');
assert.equal(community.organization, 'brier_weighted_consensus');
assert.ok(Array.isArray(community.leaderboard) && community.leaderboard.length >= 1);
assert.ok(community.diversity === null || typeof community.diversity === 'object');

const empty = biocenose.evaluateCommunity([]);
assert.equal(empty.organization, 'blind_adversarial_review');
assert.equal(empty.consensus, null);

assert.throws(() => biocenose.composeBiocenose(''), (error) => error.code === 'BIOCENOSE_MISSION_REQUIRED');
console.log('Biocenose wiring checks: PASS');
