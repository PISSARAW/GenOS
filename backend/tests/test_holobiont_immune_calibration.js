'use strict';

const assert = require('assert');
const { evaluateImmuneCalibration } = require('../src/services/holobionte/immune/immuneCalibrationService');

function outcome(immuneDecision, verifiedOutcome) {
  return { immuneDecision, verifiedOutcome, verified: true, verifierId: 'independent-oracle', evidenceRefs: [`proof:${immuneDecision}:${verifiedOutcome}`] };
}

function testConfusionMatrix() {
  const report = evaluateImmuneCalibration({ outcomes: [
    outcome('BLOCK', 'SAFE'), outcome('ALLOW', 'UNSAFE'),
    outcome('BLOCK', 'UNSAFE'), outcome('ALLOW', 'SAFE')
  ] });
  assert.deepStrictEqual(report.counts, { falsePositive: 1, falseNegative: 1, truePositive: 1, trueNegative: 1 });
  assert.strictEqual(report.falsePositiveRate, 0.5);
  assert.strictEqual(report.falseNegativeRate, 0.5);
  assert.strictEqual(report.oracleBacked, true);
  assert.strictEqual(report.automaticGateChange, false);
}

function testNoOracleAndEvidence() {
  const empty = evaluateImmuneCalibration();
  assert.strictEqual(empty.oracleBacked, false);
  assert.strictEqual(empty.falsePositiveRate, null);
  assert.throws(() => evaluateImmuneCalibration({ outcomes: [{ ...outcome('BLOCK', 'SAFE'), verified: false }] }), {
    code: 'HOLOBIONT_ORACLE_EVIDENCE_REQUIRED'
  });
}

testConfusionMatrix();
testNoOracleAndEvidence();
console.log('✅ Holobiont immune calibration tests passed.');
