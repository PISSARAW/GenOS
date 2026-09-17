'use strict';

const assert = require('assert');
const router = require('../src/services/philosophyRouter');
const { registryHealth } = require('../src/philosophy/relationRegistry');

async function evaluate(concept) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept } },
  });
}

async function main() {
  const political = router.listConcepts({ domain: 'politics' });
  const adaptedPolitical = political.filter((concept) => concept.service === 'politicalPhilosophyService');
  assert.ok(adaptedPolitical.length >= 9);
  assert.ok(adaptedPolitical.every((concept) => concept.status === 'implemented'));

  for (const concept of adaptedPolitical) {
    const result = await evaluate(concept.id);
    assert.equal(result.supported, true, concept.id);
    assert.equal(result.result.executable, false, concept.id);
    assert.equal(result.result.evidenceRequired, true, concept.id);
  }

  const planned = await evaluate('ontology.person-other');
  assert.equal(planned.supported, false);
  assert.equal(planned.executable, false);
  assert.equal(planned.status, 'planned');

  const health = router.registryHealth();
  assert.equal(health.valid, true, health.errors.join('; '));
  const relationHealth = registryHealth();
  assert.equal(relationHealth.valid, true, relationHealth.errors.join('; '));

  await assert.rejects(
    () => evaluate('politics.unknown'),
    /Unknown philosophical concept/
  );
  console.log('Political governance contract tests passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
