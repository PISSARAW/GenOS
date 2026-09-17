'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function evaluate(concept, argumentsValue) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...argumentsValue } },
  });
}

async function main() {
  const causal = await evaluate('causality.hume-regularity', {
    observations: [{ cause: 'a', effect: 'b' }],
  });
  assert.equal(causal.supported, true);
  assert.equal(causal.result.inference, 'regularity_based');
  const freeWill = await evaluate('causality.free-will', { agent: 'a1', choice: 'act' });
  assert.equal(freeWill.result.model, 'compatibilism');
  const block = await evaluate('time.block-universe', { ontology: 'eternalism' });
  assert.equal(block.result.allTimesEquallyReal, true);
  const arrow = await evaluate('time.arrow', { direction: 'increasing_entropy' });
  assert.equal(arrow.result.asymmetric, true);
  const spacetime = await evaluate('time.spacetime-relativity', { observer: 'o1' });
  assert.equal(spacetime.result.absoluteTime, false);
  const perception = await evaluate('school.merleau-ponty', { agentId: 'a1' });
  assert.equal(perception.supported, true);
  assert.equal(perception.result.embodiment.bodyProper, true);
  assert.equal(router.registryHealth().valid, true);
  console.log('Causality, temporality and phenomenology: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
