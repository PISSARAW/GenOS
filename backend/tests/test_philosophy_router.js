'use strict';

const assert = require('assert');
const router = require('../src/services/philosophyRouter');

async function main() {
  const health = router.registryHealth();
  assert.strictEqual(health.valid, true);
  assert.ok(health.conceptCount >= 135);

  const concepts = router.listConcepts({ domain: 'causality' });
  assert.ok(concepts.length >= 4);
  assert.ok(concepts.every((concept) => concept.domain === 'causality'));
  const epistemology = router.listConcepts({ family: 'epistemology' });
  assert.ok(epistemology.length > 0);
  assert.ok(epistemology.every((concept) => concept.family === 'epistemology'));
  const being = router.getConcept('ontology.being');
  assert.strictEqual(being.status, 'implemented');
  assert.strictEqual(being.apiVersion, 'genos.philosophy/v1');
  assert.strictEqual(being.kind, 'PhilosophicalConcept');

  const platonic = await router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept: 'school.platonism', formName: 'perfect_agent' } },
  });
  assert.strictEqual(platonic.supported, true);
  assert.strictEqual(platonic.result.id, 'perfect_agent');

  const utilitarian = await router.handlePhilosophyRequest({
    request: {
      operation: 'evaluateConcept',
      arguments: {
        concept: 'ethics.act-utilitarianism',
        action: { id: 'review' },
        outcomes: [{ utility: 2, probability: 1 }],
      },
    },
  });
  assert.strictEqual(utilitarian.supported, true);
  assert.strictEqual(utilitarian.result.framework, 'act-utilitarianism');
  assert.strictEqual(utilitarian.result.executable, false);

  const planned = await router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept: 'ontology.person-other' } },
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
  await assert.rejects(
    () => router.handlePhilosophyRequest(),
    /Philosophy request must be an object/
  );
  await assert.rejects(
    () => router.handlePhilosophyRequest({ request: { operation: 'evaluateConcept', arguments: { concept: 'school.kantianism', operation: 'notAServiceMethod' } } }),
    /Unsupported philosophy adapter operation/
  );
  console.log('Philosophy router: registry, adapters and planned-state handling passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
