'use strict';
const assert = require('assert');
const { generatePopulation, validateProvenance } = require('../src/services/morphogeneticPopulationService');
const result = generatePopulation({ limit: 1, signals: [{ id: 's1', genome: { x: 1 } }, { id: 's2', genome: { x: 2 } }] });
assert.strictEqual(result.population.length, 1);
assert.strictEqual(result.bounded, true);
assert.strictEqual(validateProvenance(result.population).valid, true);
console.log('✅ morphogenetic population tests passed');
