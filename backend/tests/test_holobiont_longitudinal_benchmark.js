'use strict';

const assert = require('assert');
const { ARMS, evaluateLongitudinalBenchmark } = require('../src/services/holobionte/benchmark/longitudinalBenchmarkService');

function run(missionId, armIndex, missionIndex) {
  const metricValues = armIndex === ARMS.indexOf('fullHolobiont') ? {
    capabilityNeeds: 2, residentCapabilitiesReused: 1, admissions: 1, harmfulAdmissions: 0,
    immuneFalsePositives: 1, verifiedSafeBlocks: 2, immuneFalseNegatives: 0,
    verifiedUnsafeAllows: 1, replacementTimeSeconds: 10, dependencyConcentration: 0.2,
    functionalRedundancy: 0.8, inheritableSymbionts: 2, retainedSymbionts: 1,
    dysbiosisEvents: 0, recoveryTimeSeconds: 8
  } : {};
  return {
    missionId, success: missionIndex % 10 !== 0, cost: 12 + armIndex, tokens: 100 + missionIndex,
    verifierId: `verifier-${missionIndex}`, evidenceRefs: [`proof:${armIndex}:${missionIndex}`], metrics: metricValues
  };
}

function benchmark(missionCount = 50) {
  return {
    benchmarkId: 'longitudinal-coding',
    arms: Object.fromEntries(ARMS.map((arm, armIndex) => [arm,
      Array.from({ length: missionCount }, (_, index) => run(`mission-${index}`, armIndex, index))]))
  };
}

function testLongitudinalComparison() {
  const report = evaluateLongitudinalBenchmark(benchmark());
  assert.strictEqual(report.missionCount, 50);
  assert.strictEqual(report.arms.fullHolobiont.taskSuccessRate, 0.9);
  assert.strictEqual(report.arms.fullHolobiont.symbiosis.residentReuseRate, 0.5);
  assert.strictEqual(report.arms.fullHolobiont.symbiosis.unsafeAdmissionRate, 0);
  assert.strictEqual(report.arms.singleLlm.symbiosis.residentReuseRate, null);
  assert.strictEqual(report.promotionDecision, null);
}

function testEvidenceAndMatchedHorizonAreRequired() {
  const tooShort = benchmark(49);
  assert.throws(() => evaluateLongitudinalBenchmark(tooShort), { code: 'HOLOBIONT_BENCHMARK_INVALID' });
  const mismatched = benchmark();
  mismatched.arms.aTeam[0].missionId = 'other-mission';
  assert.throws(() => evaluateLongitudinalBenchmark(mismatched), { code: 'HOLOBIONT_BENCHMARK_INVALID' });
  const unevidenced = benchmark();
  unevidenced.arms.fullHolobiont[0].evidenceRefs = [];
  assert.throws(() => evaluateLongitudinalBenchmark(unevidenced), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
}

testLongitudinalComparison();
testEvidenceAndMatchedHorizonAreRequired();
console.log('✅ Holobiont longitudinal benchmark tests passed.');
