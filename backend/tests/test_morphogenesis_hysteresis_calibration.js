'use strict';

const assert = require('node:assert/strict');
const calibration = require('../src/services/morphogenesis/morphogenesisHysteresisCalibration');

const unavailable = { status: 'unavailable', candidates: {} };
const compiled = {
  verifiedSampleCount: 80,
  scales: {
    RESOURCE_REALLOCATION: { status: 'calibrated', candidates: {
      efficient: { status: 'calibrated', validationGain: 0.4,
        validationCost: 0.1, costUncertainty: 0.02 }
    } },
    COMMUNICATION_REDUCTION: { status: 'calibrated', candidates: {
      sparse: { status: 'calibrated', validationGain: 0.3,
        validationCost: 0.2, costUncertainty: 0.08 }
    } },
    ROSTER_REDUCTION: unavailable
  }
};

const policy = calibration.fromCompiled(compiled);
assert.equal(policy.schema, 'genos.morphogenesis-hysteresis-calibration/v1');
assert.equal(policy.minimumGain, 0.2);
assert.equal(policy.cooldownMs, 64000);
assert.equal(policy.transitionBudget, 0.8);
assert.equal(policy.sampleCount, 80);
assert.match(policy.evidenceDigest, /^sha256:[a-f0-9]{64}$/);
assert.equal(calibration.fromCompiled({ verifiedSampleCount: 0,
  scales: { RESOURCE_REALLOCATION: unavailable } }), null);
console.log('Measured paired costs calibrate hysteresis; missing evidence preserves defaults.');
