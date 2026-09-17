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
  const consciousness = router.listConcepts({ genosDomain: 'consciousness' });
  assert.ok(consciousness.length > 0);
  assert.ok(consciousness.every((concept) => concept.genosDomains.includes('consciousness')));
  const relations = router.listRelations({ relationType: 'alternativeTo' });
  assert.ok(relations.length > 0);
  const neighborhood = router.getNeighborhood('metaphysics.dualism');
  assert.ok(neighborhood.neighbors.some((concept) => concept.id === 'metaphysics.material-monism'));
  const graph = router.exportGraph({ genosDomain: 'consciousness' });
  assert.ok(graph.nodes.length > 0);
  assert.ok(graph.edges.every((edge) => graph.nodes.some((node) => node.id === edge.source.id)));

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

  const preview = await router.handlePhilosophyRequest({
    request: { operation: 'applyRuntimeEffect', arguments: { concept: 'school.platonism', agentId: 'a1', effect: 'require_evidence' } },
  });
  assert.strictEqual(preview.applied, false);
  assert.strictEqual(preview.requiresApply, true);
  await assert.rejects(
    () => router.handlePhilosophyRequest({
      request: { operation: 'applyRuntimeEffect', arguments: { concept: 'school.platonism', agentId: 'a1', effect: 'unknown', apply: true } },
    }),
    /Unsupported philosophy runtime effect/
  );

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
