const assert = require('node:assert/strict');
const biocenose = require('../src/services/biocenoseService');

// Sans oracle : le Brier reste null (pas de vérité circulaire fabriquée)
const noOracle = biocenose.brierConsensus([
  { events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 's', confidence: 0.9 }] } }] },
  { events: [{ evidenceReport: { outcome: 'failed', claims: [{ statement: 's', confidence: 0.9 }] } }] }
]);
assert.equal(noOracle.participantCount, 2);
assert.equal(noOracle.meanBrier, null);
assert.equal(noOracle.oracleMissing, true);

// Avec oracle externe 'success' : le Brier mesure la calibration réelle
const consensus = biocenose.brierConsensus([
  { events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 's', confidence: 0.9 }] } }] },
  { events: [{ evidenceReport: { outcome: 'failed', claims: [{ statement: 's', confidence: 0.9 }] } }] }
], { oracleResult: 'success' });
assert.equal(consensus.participantCount, 2);
assert.ok(consensus.meanBrier > 0);
assert.ok(Number.isFinite(consensus.weightedSupport));

// Oracle 'success' + agent parfait (confidence 1, outcome success) → Brier 0
const perfect = biocenose.brierConsensus([{ events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 's', confidence: 1 }] } }] }], { oracleResult: 'success' });
assert.equal(perfect.meanBrier, 0);
assert.equal(perfect.reached, true);

const quorum = biocenose.quorumWithAbstention([
  { support: true, weight: 2 },
  { support: false, weight: 1 },
  { abstain: true }
], { quorumRatio: 0.5 });
assert.equal(quorum.reached, true);
assert.equal(quorum.support, 0.667);
assert.equal(quorum.abstentions, 1);
assert.equal(quorum.activeVoters, 2);

const community = biocenose.evaluateCommunity([]);
assert.equal(community.brier.reached, false);
assert.equal(community.brier.meanBrier, null);
console.log('Biocenose Brier/quorum checks: PASS');
