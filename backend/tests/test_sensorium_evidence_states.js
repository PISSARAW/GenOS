'use strict';

const assert = require('node:assert/strict');
const sensorium = require('../src/services/perception/sensoriumService');

sensorium.clearSensorium();
sensorium.createSensorium({ agentId: 'evidence-agent' });
const observed = sensorium.recordObservation({
  agentId: 'evidence-agent',
  observation: { sensorId: 'browser', target: 'https://example.test', informationGain: 0.4 }
});
assert.equal(observed.observations.at(-1).provenance.state, 'observed');
assert.equal(observed.observations.at(-1).provenance.verified, false);

const verified = sensorium.recordObservation({
  agentId: 'evidence-agent',
  observation: {
    sensorId: 'browser', evidenceState: 'verified', evidenceRef: 'receipt-1',
    target: 'https://example.test/verified', informationGain: 0.8
  }
});
assert.equal(verified.observations.at(-1).provenance.state, 'verified');
assert.equal(verified.observations.at(-1).provenance.verified, true);

const rejected = sensorium.recordObservation({
  agentId: 'evidence-agent',
  observation: { sensorId: 'browser', evidenceState: 'rejected', rejectionReason: 'tampered' }
});
assert.equal(rejected.observations.at(-1).provenance.state, 'rejected');
assert.equal(rejected.environmentModel.landmarks.length, 2);
assert.equal(sensorium.normalizeObservation({ evidenceState: 'rejected' }), null);
console.log('Sensorium evidence states and rejection gate: PASS');
