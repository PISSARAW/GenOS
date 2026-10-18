'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const biocenose = require('../src/services/biocenoseService');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const community = await biocenose.prepareCommunity({
      db, orchestratorId: 'operator', mission: 'Estimate the probability of a verified outcome.'
    });
    assert.ok(community.communityId);

    const dossiers = [
      { events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 's', confidence: 0.9 }] } }] },
      { events: [{ evidenceReport: { outcome: 'failed', claims: [{ statement: 's', confidence: 0.1 }] } }] }
    ];

    const eventId = 'event-consensus-1';
    const domain = 'delivery';
    const oracleReceipt = {
      status: 'VERIFIED', receiptId: 'resolution-consensus-1',
      communityId: community.communityId, eventId, domain, outcome: 1
    };

    const untrusted = biocenose.brierConsensus(dossiers, {
      oracleResult: 'success', communityId: community.communityId,
      eventId, domain, oracleReceipt, isTrustedReceipt: () => false
    });
    assert.equal(untrusted.meanBrier, null, 'untrusted resolution receipt cannot publish Brier consensus');
    assert.equal(untrusted.oracleMissing, true);

    const trusted = biocenose.brierConsensus(dossiers, {
      oracleResult: 'success', communityId: community.communityId,
      eventId, domain, oracleReceipt, isTrustedReceipt: (receipt) => receipt === oracleReceipt
    });
    assert.equal(trusted.participantCount, 2);
    assert.ok(Number.isFinite(trusted.meanBrier) && trusted.meanBrier >= 0);
    assert.ok(Number.isFinite(trusted.weightedSupport));

    const evaluated = biocenose.evaluateCommunity(dossiers, {
      oracleResult: 'success', communityId: community.communityId,
      eventId, domain, oracleReceipt, isTrustedReceipt: (receipt) => receipt === oracleReceipt
    });
    assert.equal(evaluated.brier.meanBrier, trusted.meanBrier);
    assert.equal(evaluated.brier.reached, trusted.reached);

    const perfectReceipt = { ...oracleReceipt, receiptId: 'resolution-consensus-2', eventId: 'event-consensus-2' };
    const perfect = biocenose.brierConsensus([
      { events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 's', confidence: 1 }] } }] }
    ], {
      oracleResult: 'success', communityId: community.communityId,
      eventId: 'event-consensus-2', domain, oracleReceipt: perfectReceipt,
      isTrustedReceipt: (receipt) => receipt === perfectReceipt
    });
    assert.equal(perfect.meanBrier, 0);
    assert.equal(perfect.reached, true);

    console.log('Biocenose Brier consensus receipt integration: PASS');
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
