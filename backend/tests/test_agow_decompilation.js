'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/agow/proceduralization/decompilationService');

assert.deepEqual(service.reasons({ predictionError: 0.2 }), []);
assert.deepEqual(service.reasons({ predictionError: 0.8, environmentDrift: true, safetyContextChanged: true }),
  ['prediction_error', 'environment_drift', 'safety_context_changed']);
assert.equal(service.reasons({ contradiction: true })[0], 'contradiction');
assert.equal(service.reasons({ evidenceRequirementIncreased: true })[0], 'evidence_requirement_increased');
console.log('✅ AGOW decompilation triggers and surprise thresholds passed');
