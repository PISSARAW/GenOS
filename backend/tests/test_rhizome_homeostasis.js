'use strict';

const assert = require('node:assert/strict');
const homeostasis = require('../src/services/rhizome/runtime/homeostasisController');
const rhizome = require('../src/services/rhizomeCoordinationService');
const runtime = require('../src/services/rhizome/runtime/rhizomeRuntime');

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

async function verifyRuntimeVariantSwitch() {
  const need = { needId: 'gap', capability: 'missing' };
  const dynamic = await rhizome.composeRhizome('Switch after capability uncertainty.', { variant: 'routing' });
  await runtime.run({ sessionId: dynamic.sessionId, needs: [need], maxTicks: 1 });
  assert.equal(dynamic.variant, 'exploratory');
  const fixed = await rhizome.composeRhizome('Keep a fixed route profile.', { variant: 'routing' });
  await runtime.run({ sessionId: fixed.sessionId, needs: [need], maxTicks: 1, dynamicVariants: false });
  assert.equal(fixed.variant, 'routing');
}

run();
verifyRuntimeVariantSwitch().then(() => console.log('Rhizome homeostasis and variants: PASS')).catch((error) => {
  console.error('Rhizome homeostasis runtime failed:', error);
  process.exit(1);
});
