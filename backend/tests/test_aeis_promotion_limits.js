'use strict';
const assert = require('node:assert/strict');
const { evaluateReportWithAeis, evaluateAeisForPromotion } = require('../src/services/epistemic/aeisPromotionBridge');
async function main() {
  const claim = { statement: 'echo ok outputs "ok"', test: { command: 'echo ok', expectOutput: 'ok' } };
  for (const budget of [0, 1, -1, 2.5, NaN]) {
    const result = await evaluateReportWithAeis({ claims: [claim] }, { maxVerifierExecutions: budget });
    assert.equal(result.evaluation.eligible, false);
    assert.equal(result.allAccepted, false);
    assert.equal(result.assembly, null);
    assert.equal(result.holobionteResults.length, 0);
  }
  const oversized = await evaluateReportWithAeis({ claims: new Array(33).fill(claim) });
  assert.equal(oversized.evaluation.eligible, false);
  assert.equal(oversized.holobionteResults.length, 0);
  assert.equal((await evaluateAeisForPromotion(new Array(33).fill({}))).evaluation.eligible, false);
  console.log('AEIS rejects oversized reports and insufficient execution budgets before spawning any verifier: PASS');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
