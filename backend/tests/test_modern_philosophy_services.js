'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function evaluate(concept, argumentsValue) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...argumentsValue } },
  });
}

async function main() {
  const cases = [
    ['school.newtonianism', { operation: 'tempsAbsolu' }, 'absolute'],
    ['school.kantianism', { operation: 'categoriesAPriori' }, 'categories'],
    ['school.hegelianism', { operation: 'dialectique', thesis: 'être', antithesis: 'néant' }, 'synthesis'],
    ['school.schopenhauer', { operation: 'willRepresentation', subject: 'agent-1' }, 'worldAs'],
    ['school.nietzsche', { operation: 'eternalReturn', state: 'mission' }, 'criterion'],
    ['school.bergsonism', { operation: 'intuition', agent: 'agent-1', object: 'flux' }, 'method'],
  ];
  for (const [concept, args, field] of cases) {
    const result = await evaluate(concept, args);
    assert.equal(result.supported, true, `${concept} must be executable`);
    assert.ok(result.result[field], `${concept} must expose ${field}`);
  }
  assert.equal(router.getConcept('time.newtonian').status, 'implemented');
  assert.equal(router.getConcept('process.bergsonian-vital-impulse').status, 'implemented');
  assert.equal(router.registryHealth().valid, true);
  console.log('Newton, Kant, Hegel, Schopenhauer, Nietzsche and Bergson: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
