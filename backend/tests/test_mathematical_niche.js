'use strict';

const assert = require('node:assert');
const { createMathematicalNiche } = require('../src/services/mathematical/mathematicalNiche');
const { createResearchLineage } = require('../src/services/mathematical/researchLineage');
const { MathematicalNichePopulationService } = require('../src/services/mathematical/mathematicalNichePopulationService');

const nps = new MathematicalNichePopulationService();
const niche = createMathematicalNiche({
  name: 'SAT-formulation',
  representation: 'SAT',
  formulation: 'Encode Goldbach as SAT',
});
nps.addNiche(niche); // Initialize population
assert.ok(niche.id);
assert.strictEqual(niche.representation, 'SAT');

// Add lineage
const l = createResearchLineage({ name: 'test-lineage' });
niche.addLineage(l);
assert.strictEqual(niche.lineages.size, 1);

// Record returns
niche.recordReturn(0.5, 10);
niche.recordReturn(0.3, 10);
assert.strictEqual(niche.totalInfoGain, 0.8);

// MVT evaluation (should depart if marginal yield < envMean)
const mvt = niche.evaluateMVT(0.5);
assert.ok(typeof mvt.shouldDepart === 'boolean');

// Trace
niche.addTrace({ type: 'repellent', payload: { state: 'x1=1' } });
assert.strictEqual(niche.stigmergicTraces.length, 1);

console.log('OK mathematicalNiche');
