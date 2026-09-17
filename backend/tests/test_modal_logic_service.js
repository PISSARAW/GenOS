'use strict';
const assert = require('node:assert/strict');
const modal = require('../src/services/modalLogicService');
const model = { worlds: ['w0', 'w1'], actualWorld: 'w0', accessibility: [['w0', 'w0'], ['w0', 'w1'], ['w1', 'w1']], valuation: { w0: { A: true }, w1: { A: false } } };
assert.equal(modal.evaluateFormula({ formula: '◇A', model }).value, true);
assert.equal(modal.evaluateFormula({ formula: '□A', model }).value, false);
assert.equal(modal.frameProperties({ model }).systems.T, true);
console.log('modal logic service: ok');
