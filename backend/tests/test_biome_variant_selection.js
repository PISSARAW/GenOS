'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biome/variants/variantPolicyService');

const MISSIONS = [
  ['Allocate scarce resources under a constrained budget.', 'resource'],
  ['Explore unknown patches and debug an unfamiliar system.', 'exploration'],
  ['Optimize quality and diversity in creative alternatives.', 'quality_diversity'],
  ['Move a long project through its delivery phases.', 'successional'],
  ['Recover resilience after a regional failure.', 'resilience'],
  ['Maintain a persistent workspace over the long term.', 'persistent'],
  ['Discover novel options in an open-ended problem.', 'open_ended'],
  ['Run a security red-team attack simulation.', 'adversarial'],
  ['Research source collections and cite the literature.', 'knowledge'],
  ['Allocate GPU compute across local and cloud hardware.', 'compute'],
  ['Coordinate many agents at multiple scales.', 'multi_scale']
];

for (const [mission, expected] of MISSIONS) {
  const selected = biome.select(mission);
  assert.equal(selected.variant, expected, mission);
  assert.equal(selected.selection.method, 'mission_signals');
  assert.ok(selected.focus);
}

for (const variant of biome.list()) {
  assert.equal(biome.select('generic task', { variant }).variant, variant);
}
assert.equal(biome.select('generic task').variant, 'resource');
assert.equal(biome.select('generic task', { scope: 'persistent' }).scope, 'persistent');
assert.throws(() => biome.select('task', { variant: 'unknown' }), { code: 'BIOME_VARIANT_UNKNOWN' });
console.log('Biome variant selection: PASS');
