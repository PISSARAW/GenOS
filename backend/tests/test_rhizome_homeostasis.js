'use strict';

const assert = require('node:assert/strict');
const homeostasis = require('../src/services/rhizome/runtime/homeostasisController');

function run() {
  const controller = homeostasis.create();
  const failed = controller.observe({ status: 'ROUTE_FAILED_NO_ALTERNATIVE' });
  assert.equal(failed.pressure, 2);
  assert.equal(failed.recommendedVariant, 'resilient');
  const gap = controller.observe({ status: 'GAP_OPEN' }, { budgetTight: true });
  assert.equal(gap.recommendedVariant, 'resilient');
  const stable = homeostasis.create();
  assert.equal(stable.observe({ status: 'ROUTE_SUCCESS' }).stableTicks, 1);
  assert.equal(stable.observe({ status: 'ROUTE_RECOVERED' }).stableTicks, 2);
  assert.equal(stable.observe({ status: 'GAP_OPEN' }).stableTicks, 0);
}

run();
console.log('Rhizome homeostasis controller: PASS');
