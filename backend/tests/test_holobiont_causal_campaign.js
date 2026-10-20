'use strict';

const assert = require('node:assert/strict');
const campaign = require('../../benchmarks/holobiont-causal-campaign/campaign.cjs');

function testRealBoundedCampaign() {
  const report = campaign.runCampaign({ repetitions: 2 });
  assert.equal(report.status, 'PASS');
  assert.equal(report.bounds.cases, 3);
  assert.equal(report.bounds.repetitions, 2);
  assert.equal(report.bounds.totalArmRuns, 12);
  for (const testCase of report.cases) {
    assert.equal(testCase.status, 'PASS');
    assert.equal(testCase.repetitions.length, 2);
    for (const repetition of testCase.repetitions) {
      assert.equal(repetition.status, 'PASS');
      assert.notEqual(repetition.arms.baseline.isolation.pid, repetition.arms.holobiont.isolation.pid);
      assert.equal(repetition.arms.holobiont.missionStatus, 'VERIFIED');
      const proof = repetition.arms.holobiont.admissionIsolationProof;
      assert.equal(proof.status, 'VERIFIED');
      assert.equal(proof.adapterProofHash, repetition.arms.holobiont.trialAdapterProofHash);
      assert.match(proof.evidenceRefs[0], /^isolation-proof:/);
      assert.equal(repetition.arms.baseline.metrics.tokenUsage, null);
      assert.equal(repetition.arms.baseline.metrics.admissionCount, null);
      assert.equal(repetition.arms.baseline.metrics.sessionClosed, null);
    }
  }
}

function testIndependentOracleCanFailACase() {
  const observed = [];
  const runArm = ({ arm, testCase, repetition }) => {
    const output = { value: testCase.expected + (arm === 'holobiont' ? 1 : 0) };
    observed.push({ arm, caseId: testCase.id, repetition });
    return { runnerId: `test-${arm}`, output, metrics: { unavailable: null },
      evidenceRefs: [], isolation: { kind: 'test-double', pid: arm } };
  };
  const report = campaign.runCampaign({ repetitions: 1, runArm, enforceProcessIsolation: false });
  assert.equal(report.status, 'FAIL');
  assert.equal(report.cases.every((entry) => entry.status === 'FAIL'), true);
  assert.equal(report.cases[0].repetitions[0].arms.baseline.oracle.status, 'PASS');
  assert.equal(report.cases[0].repetitions[0].arms.holobiont.oracle.status, 'FAIL');
  assert.equal(observed.length, 6);
}

function testBoundsFailClosed() {
  assert.throws(() => campaign.runCampaign({ repetitions: 0 }), {
    code: 'HOLOBIONT_CAUSAL_CAMPAIGN_INVALID'
  });
  assert.throws(() => campaign.runCampaign({ repetitions: campaign.BOUNDS.maxRepetitions + 1 }), {
    code: 'HOLOBIONT_CAUSAL_CAMPAIGN_INVALID'
  });
}

testRealBoundedCampaign();
testIndependentOracleCanFailACase();
testBoundsFailClosed();
console.log('Holobiont bounded causal campaign tests passed.');
