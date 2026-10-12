'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const biocenose = require('../src/services/biocenoseService');
const communityStore = require('../src/services/biocenose/communityStore');
const variants = require('../src/services/biocenose/runtime/variantOrchestrator');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const community = await biocenose.prepareCommunity({ db, orchestratorId: 'operator',
      mission: 'Forecast the probability of an event.', options: { variant: 'forecasting_crowd' } });
    const session = await communityStore.loadSession(db, community.communityId);
    const memberId = session.members.find((item) => item.role === 'independent_solver').memberId;
    assert.ok(memberId);
    const forecasts = [{ memberId, eventId: 'event-A', domain: 'delivery', probability: 0.8 }];
    const receipt = { status: 'VERIFIED', receiptId: 'oracle-A',
      communityId: community.communityId, eventId: 'event-A', domain: 'delivery', outcome: 1 };
    const outcome = { eventId: 'event-A', domain: 'delivery', outcome: 1,
      oracleRef: 'oracle-A', receipt };
    const input = { db, communityId: community.communityId, actorId: 'operator', forecasts,
      isTrustedReceipt: () => true };
    const mismatches = [
      { ...receipt, communityId: 'foreign-community' },
      { ...receipt, eventId: 'event-B' },
      { ...receipt, domain: 'security' },
      { ...receipt, outcome: 0 }
    ];
    for (const mismatch of mismatches) {
      const recorded = await variants.persistResolvedOutcomes({ ...input,
        outcomes: [{ ...outcome, receipt: mismatch }] });
      assert.deepEqual(recorded, []);
      assert.equal(variants.scoreResolvedForecasts(forecasts, recorded).resolvedCount, 0);
    }
    assert.deepEqual(await variants.persistResolvedOutcomes({ ...input,
      outcomes: [{ ...outcome, oracleRef: 'foreign-reference' }] }), []);
    assert.deepEqual(await variants.persistResolvedOutcomes({ ...input,
      outcomes: [outcome], isTrustedReceipt: () => false }), []);
    assert.equal((await db.all('SELECT * FROM biocenose_calibration WHERE community_id = ?',
      community.communityId)).length, 0);
    const recorded = await variants.persistResolvedOutcomes({ ...input, outcomes: [outcome] });
    assert.equal(recorded[0].calibratedCount, 1);
    assert.equal(recorded[0].outcome, 1);
    const comparison = variants.scoreResolvedForecasts([...forecasts,
      { memberId, eventId: 'event-A', domain: 'security', probability: 0.1 }], recorded);
    assert.equal(comparison.resolvedCount, 1);
    assert.equal((await db.all('SELECT * FROM biocenose_calibration WHERE community_id = ?',
      community.communityId)).length, 1);
  } finally { await db.close(); }
}

run().then(() => console.log('Biocenose forecast resolution proof: PASS')).catch((error) => {
  console.error(error); process.exitCode = 1;
});
