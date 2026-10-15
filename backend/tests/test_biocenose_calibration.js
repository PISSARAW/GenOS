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
    const receipt = { status: 'VERIFIED', receiptId: 'external-resolution-42',
      communityId: community.communityId, eventId: 'event-1', domain: 'delivery', outcome: 1 };
    const result = await recordCalibrationOutcome({
      db, communityId: community.communityId, eventId: 'event-1', domain: 'delivery', outcome: 1,
      oracleRef: 'external-resolution-42', receipt, isTrustedReceipt: (candidate) => candidate === receipt, forecasts: [
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
    const runtimeReceipt = { status: 'VERIFIED', receiptId: 'external-resolution-43',
      communityId: community.communityId, eventId: 'event-2', domain: 'delivery', outcome: 0 };
    const recorded = await require('../src/services/biocenose/runtime/variantOrchestrator').persistResolvedOutcomes({
      db, communityId: community.communityId, actorId: 'orchestrator',
      forecasts: [{ memberId: generatorId, eventId: 'event-2', domain: 'delivery', probability: 0.75 }],
      outcomes: [{ eventId: 'event-2', domain: 'delivery', outcome: 0, receipt: runtimeReceipt }],
      isTrustedReceipt: (candidate) => candidate === runtimeReceipt
    });
    assert.equal(recorded.length, 1, 'runtime forwards its verified resolution receipt into persistence');
    const untrusted = await require('../src/services/biocenose/runtime/variantOrchestrator').persistResolvedOutcomes({
      db, communityId: community.communityId, actorId: 'orchestrator',
      forecasts: [{ memberId: generatorId, eventId: 'event-3', domain: 'delivery', probability: 0.75 }],
      outcomes: [{ eventId: 'event-3', domain: 'delivery', outcome: 0,
        receipt: { ...runtimeReceipt, eventId: 'event-3' } }], isTrustedReceipt: () => false
    });
    assert.equal(untrusted.length, 0, 'runtime does not persist untrusted resolutions');
    await assert.rejects(() => recordCalibrationOutcome({
      db, communityId: community.communityId, eventId: 'event-1', domain: 'delivery', outcome: 1,
      oracleRef: 'external-resolution-42', receipt, isTrustedReceipt: (candidate) => candidate === receipt,
      forecasts: [{ memberId: generatorId, probability: 0.9 }]
    }));
    await assert.rejects(() => recordCalibrationOutcome({ db, communityId: community.communityId,
      eventId: 'event-2', domain: 'delivery', outcome: 1, oracleRef: 'untrusted',
      forecasts: [{ memberId: generatorId, probability: 0.9 }] }), { code: 'BIOCENOSE_CALIBRATION_INVALID' });
    await assert.rejects(() => recordCalibrationOutcome({ db, communityId: community.communityId,
      eventId: 'event-2', domain: 'delivery', outcome: 0, oracleRef: 'external-resolution-42', receipt,
      isTrustedReceipt: () => true, forecasts: [{ memberId: generatorId, probability: 0.9 }] }),
    { code: 'BIOCENOSE_CALIBRATION_INVALID' });
  } finally {
    await db.close();
  }
}

run().then(() => process.stdout.write('Biocenose calibration checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
