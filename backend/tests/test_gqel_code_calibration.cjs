'use strict';
const assert = require('node:assert/strict');
const service = require('../src/services/qualityElevation/qualityReviewService');
const code = require('../src/services/qualityElevation/qualityCodeCalibration');

async function calibration(profile, wrong) {
  const samples = profile === 'code' ? code.CALIBRATION : service.CALIBRATION;
  const observed = [];
  const reviewer = {id: 'controlled-reader', model: 'fixture:only', review: async request => {
    const data = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n') + 1));
    const sample = samples.find(item => item.text === data.artifact);
    assert.ok(sample); observed.push(request.prompt);
    return {checks: data.criteria.map(criterion => ({criterionId: criterion.id,
      verdict: wrong ? 'pass' : sample.expected, reason: 'Controlled transport fixture for domain routing.',
      evidence: [{quote: data.artifact.slice(0, 100)}], rating: null}))};
  }};
  const result = await service.calibrateReviewer(reviewer, {contract: {profile, maxProtocolRepairs: 0},
    invoke: (callback, request) => callback(request)});
  assert.equal(observed.length, 4);
  return {result, observed};
}
async function main() {
  const passing = await calibration('code', false);
  assert.equal(passing.result.passed, true);
  assert.equal(passing.result.controlVersion, 'gqel-code-control-v1');
  assert.ok(passing.observed.every(prompt => prompt.includes('PHASE CODE')));
  assert.ok(passing.observed.every(prompt => !prompt.includes('PHASE ARTEFACT')));
  assert.equal((await calibration('code', true)).result.passed, false);
  const previous = await calibration('prose', false);
  assert.equal(previous.result.passed, true);
  assert.equal(previous.result.controlVersion, 'gqel-control-v2.1');
  console.log('GQEL code calibration: domain routing, positive and negative controls, always-pass rejection and literary compatibility PASS');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
