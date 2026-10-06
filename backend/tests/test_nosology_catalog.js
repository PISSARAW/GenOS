'use strict';

const assert = require('node:assert/strict');
const { catalog, validateTherapy } = require('../src/services/medical/nosologyCatalogService');

assert.equal(catalog.schema, 'genos.nosology/v1');
assert.equal(catalog.conditions.length, 28);
assert.equal(new Set(catalog.conditions.map(item => item.category)).size, 9);
for (const therapy of catalog.therapies) assert.equal(validateTherapy(therapy.id), therapy.id);
for (const condition of catalog.conditions) {
  for (const therapy of condition.therapies) assert.equal(validateTherapy(therapy), therapy);
}
for (const valid of [{ Corticosteroids: 1 }, { Vaccine: 'signature' },
  { AntisepticPurge: { target_signature: 'signature' } }, { QuarantineIsolation: { capsule_id: 'capsule' } },
  { AntidoteAdmin: { target_drug: 'Corticosteroids' } }, { TelomeraseActivation: { extended_ticks: 10 } }]) {
  assert.equal(validateTherapy(valid), valid);
}
for (const invalid of [null, [], { constructor: {} }, { toString: {} }, 'UnknownTherapy', { Corticosteroids: NaN }, { Corticosteroids: -1 },
  { Corticosteroids: 2 }, { Vaccine: '' }, { ChelationTherapy: {} },
  { Vaccine: 'signature', Corticosteroids: 0.1 }, { TelomeraseActivation: { extended_ticks: 1.5 } },
  { QuarantineIsolation: { capsule_id: 'c', extra: true } }]) {
  assert.throws(() => validateTherapy(invalid), { code: 'INVALID_THERAPY' });
}
console.log('Nosology catalog and scoped therapy authorization inputs: PASS');
