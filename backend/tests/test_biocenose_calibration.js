'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { prepareCommunity, recordCalibrationOutcome, communityMemberReputation } = require('../src/services/biocenoseService');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const community = await prepareCommunity({ db, orchestratorId: 'orchestrator', mission: 'Forecast an outcome.' });
    const members = await db.all(
      `SELECT member_id, role FROM biocenose_members WHERE community_id = ? AND role IN ('independent_solver', 'adversarial_reviewer')`,
      community.communityId
    );
    const generatorId = members.find((member) => member.role === 'independent_solver').member_id;
    const reviewerId = members.find((member) => member.role === 'adversarial_reviewer').member_id;
    const result = await recordCalibrationOutcome({
      db, communityId: community.communityId, eventId: 'event-1', domain: 'delivery', outcome: 1,
      oracleRef: 'external-resolution-42', forecasts: [
        { memberId: generatorId, probability: 0.9 },
        { memberId: reviewerId, probability: 0.2 }
      ]
    });
    assert.equal(result.calibratedCount, 2);
    const strong = await communityMemberReputation({ db, memberId: generatorId, domain: 'delivery' });
    const weak = await communityMemberReputation({ db, memberId: reviewerId, domain: 'delivery' });
    assert.ok(Math.abs(strong.meanBrier - 0.01) < 1e-9);
    assert.ok(Math.abs(weak.meanBrier - 0.64) < 1e-9);
    assert.equal(strong.sampleCount, 1);
    await assert.rejects(() => recordCalibrationOutcome({
      db, communityId: community.communityId, eventId: 'event-1', domain: 'delivery', outcome: 1,
      oracleRef: 'external-resolution-42', forecasts: [{ memberId: generatorId, probability: 0.9 }]
    }));
  } finally {
    await db.close();
  }
}

run().then(() => process.stdout.write('Biocenose calibration checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
