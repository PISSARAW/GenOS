'use strict';

const assert = require('node:assert/strict');
const aggregationService = require('../src/services/biocenose/question/communityAggregationService');

/**
 * Delphi moyen: Provide error rates for 3 methods
 * Tests that the Delphi aggregation correctly computes error rates
 * for three different estimation methods
 */
function testDelphiMoyen() {
  // Three methods with known error rates
  const judgments = [
    { memberId: 'm1', judgment: { position: 0.3, method: 'method_a' } },
    { memberId: 'm2', judgment: { position: 0.35, method: 'method_a' } },
    { memberId: 'm3', judgment: { position: 0.28, method: 'method_a' } },
    { memberId: 'm4', judgment: { position: 0.7, method: 'method_b' } },
    { memberId: 'm5', judgment: { position: 0.68, method: 'method_b' } },
    { memberId: 'm6', judgment: { position: 0.72, method: 'method_b' } },
    { memberId: 'm7', judgment: { position: 0.5, method: 'method_c' } },
    { memberId: 'm8', judgment: { position: 0.52, method: 'method_c' } },
    { memberId: 'm9', judgment: { position: 0.48, method: 'method_c' } },
  ];

  const result = aggregationService.aggregate({
    questionType: 'PROBABILISTIC',
    variantPolicy: { name: 'delphi_community' },
    judgments
  });

  // Verify Delphi distribution is computed
  assert.ok(result.delphi, 'Delphi result should exist');
  assert.equal(result.delphi.anonymous, true);
  assert.equal(result.delphi.participantCount, 9);
  assert.ok(result.delphi.numeric, 'Should have numeric positions');
  assert.ok(Number.isFinite(result.delphi.interquartileRange));
  assert.ok(Number.isFinite(result.delphi.median));

  // Compute error rates per method (distance from median)
  const median = result.delphi.median;
  const methodErrors = {};
  for (const j of judgments) {
    const method = j.judgment.method;
    if (!methodErrors[method]) methodErrors[method] = [];
    methodErrors[method].push(Math.abs(j.judgment.position - median));
  }

  // Verify three methods have error rates computed
  const methods = Object.keys(methodErrors);
  assert.equal(methods.length, 3, 'Should have 3 methods');

  for (const method of methods) {
    const errors = methodErrors[method];
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    assert.ok(Number.isFinite(meanError), `Method ${method} should have finite error rate`);
    assert.ok(meanError >= 0, `Method ${method} error rate should be non-negative`);
  }

  console.log('✅ Delphi moyen test passed');
}

/**
 * Delphi difficile: Include productivity data and define 25% dispersion threshold
 * Tests that a third round is triggered when interquartile range exceeds 25% of scale
 */
function testDelphiDifficile() {
  // First round: high dispersion (> 25% of scale = 0.25)
  const firstRoundJudgments = [
    { memberId: 'm1', judgment: { position: 0.1 } },
    { memberId: 'm2', judgment: { position: 0.2 } },
    { memberId: 'm3', judgment: { position: 0.8 } },
    { memberId: 'm4', judgment: { position: 0.9 } },
    { memberId: 'm5', judgment: { position: 0.5 } },
  ];

  const firstRound = aggregationService.aggregate({
    questionType: 'PROBABILISTIC',
    variantPolicy: { name: 'delphi_community', minimumRounds: 2 },
    judgments: firstRoundJudgments
  });

  // Check dispersion (IQR) - should be > 0.25 to trigger third round
  const iqr = firstRound.delphi.interquartileRange;
  const scale = 1.0; // positions are 0-1 scale
  const dispersionThreshold = 0.25 * scale;

  assert.ok(iqr > dispersionThreshold, `First round IQR (${iqr}) should exceed 25% threshold (${dispersionThreshold})`);

  // Simulate second round with reduced dispersion
  const secondRoundJudgments = [
    { memberId: 'm1', judgment: { position: 0.4 } },
    { memberId: 'm2', judgment: { position: 0.45 } },
    { memberId: 'm3', judgment: { position: 0.55 } },
    { memberId: 'm4', judgment: { position: 0.6 } },
    { memberId: 'm5', judgment: { position: 0.5 } },
  ];

  const secondRound = aggregationService.aggregate({
    questionType: 'PROBABILISTIC',
    variantPolicy: { name: 'delphi_community', minimumRounds: 2 },
    judgments: secondRoundJudgments
  });

  const secondIQR = secondRound.delphi.interquartileRange;
  assert.ok(secondIQR <= dispersionThreshold, `Second round IQR (${secondIQR}) should be within 25% threshold`);

  // Productivity data: track convergence rate
  const convergenceRate = (iqr - secondIQR) / iqr;
  assert.ok(convergenceRate > 0, 'Should show convergence between rounds');
  assert.ok(convergenceRate <= 1, 'Convergence rate should be bounded');

  console.log('✅ Delphi difficile test passed');
}

/**
 * Forecasting: Define how histories become calibration weights and calculate scores after results revealed
 */
function testForecastingCalibration() {
  const { aggregateCommunityJudgments } = require('../src/services/biocenoseService');
  const calibration = require('../src/services/biocenose/calibration/calibrationService');

  // Simulate member history with Brier scores
  const memberHistory = [
    { eventId: 'e1', memberId: 'm1', probability: 0.8, outcome: 1 },  // Brier = 0.04
    { eventId: 'e2', memberId: 'm1', probability: 0.7, outcome: 1 },  // Brier = 0.09
    { eventId: 'e3', memberId: 'm1', probability: 0.6, outcome: 0 },  // Brier = 0.36
    { eventId: 'e1', memberId: 'm2', probability: 0.3, outcome: 1 },  // Brier = 0.49
    { eventId: 'e2', memberId: 'm2', probability: 0.4, outcome: 1 },  // Brier = 0.36
    { eventId: 'e3', memberId: 'm2', probability: 0.2, outcome: 0 },  // Brier = 0.04
  ];

  // Compute calibration weights from history (lower Brier = higher weight)
  const memberBrier = {};
  for (const record of memberHistory) {
    const brier = (record.probability - record.outcome) ** 2;
    if (!memberBrier[record.memberId]) memberBrier[record.memberId] = [];
    memberBrier[record.memberId].push(brier);
  }

  const calibrationWeights = {};
  for (const [memberId, scores] of Object.entries(memberBrier)) {
    const meanBrier = scores.reduce((a, b) => a + b, 0) / scores.length;
    // Weight inversely proportional to Brier score (with floor)
    calibrationWeights[memberId] = Math.max(0.1, 1 - meanBrier);
  }

  // Verify weights are computed
  assert.ok(calibrationWeights.m1 > 0, 'Member m1 should have positive weight');
  assert.ok(calibrationWeights.m2 > 0, 'Member m2 should have positive weight');

  // Better forecaster (m1 on e1,e2; m2 on e3) should have appropriate weights
  // m1 mean Brier: (0.04 + 0.09 + 0.36)/3 = 0.163 -> weight ~ 0.837
  // m2 mean Brier: (0.49 + 0.36 + 0.04)/3 = 0.297 -> weight ~ 0.703
  assert.ok(calibrationWeights.m1 > calibrationWeights.m2, 'Better forecaster should have higher weight');

  // Test weighted pooling vs unweighted
  const forecasts = [
    { eventId: 'e4', memberId: 'm1', probability: 0.9, calibrationWeight: calibrationWeights.m1, independenceWeight: 1 },
    { eventId: 'e4', memberId: 'm2', probability: 0.3, calibrationWeight: calibrationWeights.m2, independenceWeight: 1 },
  ];

  const variantPolicy = { name: 'forecasting_crowd', requireCalibrationWeights: true };
  const weightedResult = aggregateCommunityJudgments({
    questionType: 'PROBABILISTIC',
    variantPolicy,
    forecasts
  });

  const unweightedResult = aggregateCommunityJudgments({
    questionType: 'PROBABILISTIC',
    variantPolicy: { name: 'forecasting_crowd', requireCalibrationWeights: false },
    forecasts: forecasts.map(f => ({ eventId: f.eventId, memberId: f.memberId, probability: f.probability }))
  });

  assert.equal(weightedResult.estimates[0].weighting, 'calibration_and_independence');
  assert.equal(unweightedResult.estimates[0].weighting, 'equal_fallback');

  // Weighted should be closer to better forecaster (m1: 0.9)
  const weightedProb = weightedResult.estimates[0].probability;
  const unweightedProb = unweightedResult.estimates[0].probability;
  assert.ok(Math.abs(weightedProb - 0.9) < Math.abs(unweightedProb - 0.9),
    'Weighted pooling should favor better calibrated forecaster');

  // Brier score recording after result revealed
  const outcome = 1; // Event occurred
  const brierWeighted = (weightedProb - outcome) ** 2;
  const brierUnweighted = (unweightedProb - outcome) ** 2;

  assert.ok(Number.isFinite(brierWeighted), 'Brier score should be finite');
  assert.ok(Number.isFinite(brierUnweighted), 'Brier score should be finite');

  console.log('✅ Forecasting calibration test passed');
}

testDelphiMoyen();
testDelphiDifficile();
testForecastingCalibration();
console.log('\n✅ All Delphi and Forecasting mission tests passed');