'use strict';

const assert = require('node:assert/strict');
const { computeDiagnosisConfidence } = require('../src/services/medical/immuneSurveillanceService');

assert.ok(Math.abs(computeDiagnosisConfidence({ severity: 0.8, confidence: 0.1 }) - 0.86) < 1e-12);
assert.ok(Math.abs(computeDiagnosisConfidence({ severity: 0.8, confidence: 0.99 }) - 0.86) < 1e-12);
assert.ok(Math.abs(computeDiagnosisConfidence({ severity: 0.8 }) - 0.86) < 1e-12);
assert.equal(computeDiagnosisConfidence({ severity: 'invalid', confidence: 0.42 }), 0.42);
console.log('Nosology confidence uses pathology-specific severity only: PASS');
