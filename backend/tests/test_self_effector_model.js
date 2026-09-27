'use strict';
const assert = require('assert');
const { predictEffect, attributeObservation } = require('../src/services/selfEffectorModelService');
const prediction = predictEffect({ effectorId: 'motor', value: 2, effectors: [{ id: 'motor', gain: 2, delayMs: 10 }] });
assert.strictEqual(prediction.expected, 4);
assert.strictEqual(attributeObservation(prediction, { value: 3, delayMs: 12 }).attribution, 'self');
console.log('✅ self effector model tests passed');
