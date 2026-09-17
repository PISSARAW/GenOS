'use strict';

const assert = require('assert');
const router = require('../src/services/philosophyRouter');
const { validateRegistry } = require('../src/philosophy/conceptRegistry');
const { validateRelations } = require('../src/philosophy/relationRegistry');

const concepts = validateRegistry().concepts;
const conceptIds = new Set(concepts.map((concept) => concept.id));
assert.equal(new Set(concepts.map((concept) => concept.id)).size, concepts.length);
assert.ok(concepts.every((concept) => concept.family));
assert.ok(concepts.some((concept) => concept.genosDomains.length > 0));
assert.ok(concepts.filter((concept) => concept.genosDomains.length > 0)
  .every((concept) => concept.genosDomains.every((domain) => typeof domain === 'string')));
assert.ok(concepts.every((concept) => concept.serviceMaturity.level));
assert.ok(concepts.every((concept) => (
  !concept.serviceMaturity.executable || Boolean(concept.serviceMaturity.service)
)));

const relationResult = validateRelations();
assert.equal(relationResult.valid, true, relationResult.errors.join('; '));
assert.ok(relationResult.relations.every((relation) => (
  conceptIds.has(relation.source.id) && conceptIds.has(relation.target.id)
)));

const graph = router.exportGraph({});
const graphIds = new Set(graph.nodes.map((node) => node.id));
assert.ok(graph.nodes.length >= concepts.length);
assert.ok(graph.edges.every((edge) => (
  graphIds.has(edge.source.id) && graphIds.has(edge.target.id)
)));

const planned = router.listConcepts({ maturity: 'planned' });
assert.ok(planned.length > 0);
assert.ok(planned.every((concept) => concept.serviceMaturity.level === 'planned'));

assert.throws(
  () => router.getNeighborhood('missing.concept'),
  /Unknown philosophical concept/
);

console.log('Philosophy registry contract tests passed.');
