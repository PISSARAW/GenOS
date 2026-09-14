const assert = require('node:assert/strict');
const biocenose = require('../src/services/biocenoseService');

const consensus = biocenose.brierConsensus([
  { events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 's', confidence: 0.9 }] } }] },
  { events: [{ evidenceReport: { outcome: 'failed', claims: [{ statement: 's', confidence: 0.9 }] } }] }
]);
assert.equal(consensus.participantCount, 2);
assert.ok(consensus.meanBrier > 0);
assert.ok(Number.isFinite(consensus.weightedSupport));

const perfect = biocenose.brierConsensus([{ events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 's', confidence: 1 }] } }] }]);
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
console.log('Biocenose Brier/quorum checks: PASS');
