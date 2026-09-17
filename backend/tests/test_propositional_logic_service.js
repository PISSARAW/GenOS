'use strict';

const assert = require('node:assert/strict');
const logic = require('../src/services/propositionalLogicService');

assert.equal(logic.classifyFormula({ formula: 'A|!A' }).result, 'tautology');
assert.equal(logic.classifyFormula({ formula: 'A&!A' }).result, 'contradiction');
assert.equal(logic.areEquivalent({ left: 'A>B', right: '!A|B' }).equivalent, true);
assert.equal(logic.findCounterexample({ premises: ['A>B', 'A'], conclusion: 'B' }).valid, true);
assert.equal(logic.findCounterexample({ premises: ['A>B'], conclusion: 'A' }).valid, false);
console.log('propositional logic service: ok');
