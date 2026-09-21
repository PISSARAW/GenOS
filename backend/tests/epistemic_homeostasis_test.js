'use strict';

const assert = require('node:assert');
const h = require('../src/services/epistemic/epistemicHomeostasisService');

function fixture(overrides) {
  return Object.assign({
    claim: 'Processus X garantit Y',
    risk: { score: 0.2 },
    validityDomain: { coverage: 8, constraints: 8 },
    contradictions: [],
    novelty: 0,
    evidence: [{ kind: 'test_result', quality: 0.9 }],
    budgetRemaining: 0.9,
    budgetReference: 1,
  }, overrides);
}

assert.strictEqual(h.tierFromPressure(0.1), 'baseline');
assert.strictEqual(h.tierFromPressure(0.4), 'lean');
assert.strictEqual(h.tierFromPressure(0.6), 'adaptive');
assert.strictEqual(h.tierFromPressure(0.85), 'inflamed');
assert.strictEqual(h.tierFromPressure(0.95), 'systemic');

const avec = h.computePressure(fixture({ evidence: [{ quality: 0.9 }] }));
const sans = h.computePressure(fixture({ evidence: [] }));
assert.ok(sans > avec, 'absence de preuves = pression superieure');

assert.ok(
  h.computePressure(fixture({ validityDomain: { coverage: 0, constraints: 5 } }))
    > h.computePressure(fixture({ validityDomain: { coverage: 8, constraints: 8 } })),
  'domaine non couvert = pression superieure'
);

assert.ok(
  h.computePressure(fixture({ contradictions: [{ weight: 0.8 }] }))
    > h.computePressure(fixture({ contradictions: [] })),
  'contradiction = pression superieure'
);

const initial = h.computePressure(fixture({ evidence: [] }));
assert.ok(
  h.feedbackEffect(initial, initial, 0.4) < initial + 0.001,
  'amelioration des preuves = stabilisation de la pression'
);

assert.doesNotThrow(() => h.computePressure(null));
assert.ok(Number.isFinite(h.computePressure({ risk: { score: 'nan' } })));

const domine = h.computePressure(
  fixture({ risk: { score: 0.9 } }),
  { risk: 1, uncertainty: 0, contradiction: 0, novelty: 0, evidence: 0, cost: 0 }
);
assert.ok(domine > 0.85, 'poids dominant risque = pression levee');

console.log('OK epistemicHomeostasisService');
