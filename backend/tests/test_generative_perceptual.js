'use strict';
const assert = require('assert');
const { predict, interpolate, inspectSpace } = require('../src/services/generativePerceptualService');
const result = predict({ prior: [0, 1], observation: [1, 1], precision: 0.5 });
assert.deepStrictEqual(result.estimate, [0.5, 1]);
assert.strictEqual(interpolate([0], [1], 3)[1][0], 0.5);
assert.strictEqual(inspectSpace(result.estimate ? [result.estimate] : []).inspectable, true);
console.log('✅ generative perceptual tests passed');
