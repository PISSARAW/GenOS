'use strict';

const assert = require('assert');
const router = require('../src/services/philosophyRouter');

async function main() {
  const health = router.registryHealth();
  assert.strictEqual(health.valid, true);
  assert.strictEqual(health.conceptCount, 135);

  const concepts = router.listConcepts({ domain: 'causality' });
  assert.ok(concepts.length >= 4);
  assert.ok(concepts.every((concept) => concept.domain === 'causality'));
  assert.strictEqual(router.getConcept('ontology.being').status, 'implemented');

  const platonic = await router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept: 'school.platonism', formName: 'perfect_agent' } },
  });
  assert.strictEqual(platonic.supported, true);
  assert.strictEqual(platonic.result.id, 'perfect_agent');

  const planned = await router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept: 'school.newtonianism' } },
  });
  assert.strictEqual(planned.supported, false);
  assert.strictEqual(planned.status, 'planned');

  await assert.rejects(
    () => router.handlePhilosophyRequest({ request: { operation: 'getConcept', arguments: { id: 'unknown' } } }),
    /Unknown philosophical concept/
  );
  await assert.rejects(
    () => router.handlePhilosophyRequest({ request: { operation: 'unknown', arguments: {} } }),
    /Unknown philosophy operation/
  );
  console.log('Philosophy router: registry, adapters and planned-state handling passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
