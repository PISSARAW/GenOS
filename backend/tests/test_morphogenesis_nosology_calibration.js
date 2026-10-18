'use strict';

const assert = require('node:assert/strict');
const calibration = require('../src/services/morphogenesis/morphogenesisNosologyCalibration');
const projection = require('../src/services/morphogenesis/morphogenesisNosologyProjection');
const receiptService = require('../src/services/epistemicVerifierReceiptService');
const verifierTrust = require('../src/services/verifierTrustRegistry');

function observation(caseIndex, mode) {
  const candidate = mode === calibration.CANDIDATE;
  const quality = candidate ? 0.9 : mode === 'family_max_v1' ? 0.6 : 0.5;
  const row = { id: `${caseIndex}:${mode}`, caseId: `case-${caseIndex}`, mode,
    taskFamily: `family-${caseIndex % 3}`, modelId: `model-${caseIndex % 2}`,
    evaluationDomain: `domain-${caseIndex % 3}`, datasetDigest: `sha256:${'a'.repeat(64)}`,
    quality, cost: candidate ? 0.1 : 0.15, holdout: true };
  row.receipt = receiptService.issueReceipt({ resultId: row.id,
    evidenceDigest: calibration.digest(row),
    verifierDigest: verifierTrust.getVerifier('benchmark').digest, independent: true,
    independenceDescriptor: { actorId: 'nosology-oracle', workspaceId: `oracle-${caseIndex}` } });
  return row;
}

function campaign() {
  return Array.from({ length: calibration.MIN_CASES }, (_, index) =>
    projection.MODES.map((mode) => observation(index, mode))).flat();
}

function testQualificationNeedsVerifiedCommonHoldout() {
  assert.equal(calibration.compileCalibration([]).status, 'unavailable');
  const rows = campaign();
  const result = calibration.compileCalibration(rows);
  assert.equal(result.status, 'qualified');
  assert.equal(result.commonHoldoutCaseCount, calibration.MIN_CASES);
  assert.equal(result.comparisons.length, calibration.CONTROLS.length);
  assert.ok(result.comparisons.every((item) => item.lowerBound > 0));
  assert.equal(result.promotionAuthorized, false);
  rows[0].quality = 0;
  assert.equal(calibration.compileCalibration(rows).verifiedObservationCount,
    campaign().length - 1);
}

function testCandidateRequiresQualificationAndExplicitSelection() {
  const unavailable = calibration.compileCalibration([]);
  assert.equal(calibration.selectMode(unavailable, calibration.CANDIDATE).mode, 'family_max_v1');
  const qualified = calibration.compileCalibration(campaign());
  assert.equal(calibration.selectMode(qualified, undefined).mode, 'family_max_v1');
  assert.equal(calibration.selectMode(qualified, calibration.CANDIDATE).mode,
    calibration.CANDIDATE);
  assert.equal(calibration.selectMode(unavailable, 'no_change').mode, 'no_change');
}

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function main() {
  const keyId = process.env.GENOS_EPISTEMIC_RECEIPT_KEY_ID;
  const secret = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  process.env.GENOS_EPISTEMIC_RECEIPT_KEY_ID = 'legacy';
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'test-only-nosology-calibration-secret';
  try {
    testQualificationNeedsVerifiedCommonHoldout();
    testCandidateRequiresQualificationAndExplicitSelection();
    console.log('Morphogenesis nosology calibration: PASS');
  } finally {
    restore('GENOS_EPISTEMIC_RECEIPT_KEY_ID', keyId);
    restore('GENOS_EPISTEMIC_RECEIPT_SECRET', secret);
  }
}

main();
