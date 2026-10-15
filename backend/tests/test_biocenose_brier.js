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
const dossiers = [
  { events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 's', confidence: 0.9 }] } }] },
  { events: [{ evidenceReport: { outcome: 'failed', claims: [{ statement: 's', confidence: 0.9 }] } }] }
];
const untrusted = biocenose.brierConsensus(dossiers, { oracleResult: 'success' });
assert.equal(untrusted.meanBrier, null, 'caller-provided labels cannot change Brier weights');
const oracleReceipt = { status: 'VERIFIED', receiptId: 'resolution-1', communityId: 'community-1',
  eventId: 'event-1', domain: 'delivery', outcome: 1 };
const consensus = biocenose.brierConsensus(dossiers, { oracleResult: 'success', communityId: 'community-1',
  eventId: 'event-1', domain: 'delivery', oracleReceipt, isTrustedReceipt: (receipt) => receipt === oracleReceipt });
assert.equal(consensus.participantCount, 2);
assert.ok(consensus.meanBrier > 0);
assert.ok(Number.isFinite(consensus.weightedSupport));
const rejectedReceipt = biocenose.brierConsensus(dossiers, { oracleResult: 'success', communityId: 'community-1',
  eventId: 'event-1', domain: 'delivery', oracleReceipt, isTrustedReceipt: () => false });
assert.equal(rejectedReceipt.meanBrier, null, 'an untrusted resolution receipt cannot change Brier weights');

// Oracle 'success' + agent parfait (confidence 1, outcome success) → Brier 0
const perfect = biocenose.brierConsensus([{ events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 's', confidence: 1 }] } }] }], {
  oracleResult: 'success', communityId: 'community-1', eventId: 'event-1', domain: 'delivery',
  oracleReceipt, isTrustedReceipt: (receipt) => receipt === oracleReceipt
});
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
