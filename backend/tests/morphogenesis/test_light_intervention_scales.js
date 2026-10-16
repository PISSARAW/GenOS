'use strict';

const assert = require('node:assert/strict');
const { compileConditionalMorphogenesisPolicy } = require('../../src/services/morphogenesis/conditionalMorphogenesisPolicy');
const calibration = require('../../src/services/morphogenesis/morphogenesisSelectorCalibration');

function testDefaultPortfolioExposesFiveDistinctScales() {
  const policy = compileConditionalMorphogenesisPolicy({ mission: 'Light scales stay fail-closed',
    currentTopology: 'a_team', diagnosis: {} });
  const scales = policy.portfolio.interventionScales;
  for (const scale of ['NO_CHANGE', 'COMMUNICATION_REDUCTION', 'RESOURCE_REALLOCATION',
    'ROSTER_REDUCTION', 'EARLY_STOP', 'COHORT_REPLACEMENT']) {
    assert.ok(scales[scale], `scale ${scale} is exposed`);
  }
  assert.equal(scales.NO_CHANGE.status, 'available');
  assert.equal(scales.COMMUNICATION_REDUCTION.status, 'unavailable');
  assert.equal(scales.RESOURCE_REALLOCATION.status, 'unavailable');
  assert.equal(scales.ROSTER_REDUCTION.status, 'unavailable');
  assert.equal(scales.EARLY_STOP.status, 'unavailable');
  assert.equal(scales.ROSTER_REDUCTION.reason, 'roster_reduction_action_not_implemented');
  assert.equal(scales.EARLY_STOP.reason, 'early_stop_is_verification_gate_not_a_continuation_scale');
  assert.equal(policy.decision.interventionScale, 'NO_CHANGE');
}

function testNewScalesNeverWinWithoutRuntimeAction() {
  const empty = calibration.compileCalibration([]);
  assert.ok(empty.scales.ROSTER_REDUCTION);
  assert.ok(empty.scales.EARLY_STOP);
  assert.equal(empty.scales.ROSTER_REDUCTION.status, 'unavailable');
  assert.equal(empty.scales.EARLY_STOP.status, 'unavailable');
  const decision = calibration.selectScale(empty, [{ scale: 'ROSTER_REDUCTION',
    candidateId: 'roster-reduction:trim-to-minimum-v1' }, { scale: 'EARLY_STOP',
    candidateId: 'early-stop:verified-resolution-v1' }]);
  assert.equal(decision.scale, 'NO_CHANGE');
}

testDefaultPortfolioExposesFiveDistinctScales();
testNewScalesNeverWinWithoutRuntimeAction();
process.stdout.write('light intervention scales tests passed\n');
