'use strict';

const assert = require('node:assert/strict');
const { recommendBiocenoseTransition } = require('../src/services/biocenoseService');

assert.deepEqual(recommendBiocenoseTransition({
  currentTopology: 'biocenose', testableDisagreement: true
}), {
  kind: 'TOPOLOGY_TRANSITION', target: 'trinity', reason: 'TESTABLE_DISAGREEMENT', requiresMorphogenesisPlan: true
});
assert.equal(recommendBiocenoseTransition({
  currentTopology: 'biocenose', judgmentSettled: true, executionNeeded: true
}).target, 'a_team');
assert.equal(recommendBiocenoseTransition({
  currentTopology: 'biocenose', deterministicResolutionComplete: true
}).destination, 'direct');
assert.equal(recommendBiocenoseTransition({
  currentTopology: 'biocenose', normativeDisagreement: true
}).destination, 'human');
assert.equal(recommendBiocenoseTransition({ currentTopology: 'trinity', testableDisagreement: true }), null);

process.stdout.write('Biocenose Morphogenesis transition checks: PASS\n');
