'use strict';
const assert = require('assert');
const { reallocate, scorePrediction } = require('../src/services/modelControlledAttentionService');
const result = reallocate({ budget: 1, state: { noise: 2 }, candidates: [{ id: 'vision', stateKey: 'noise', baseDemand: 1 }, { id: 'memory', baseDemand: 0 }] });
assert.strictEqual(result.selected[0].id, 'vision');
assert.strictEqual(scorePrediction(result.predictions, ['vision']) > 0, true);
console.log('✅ model controlled attention tests passed');
