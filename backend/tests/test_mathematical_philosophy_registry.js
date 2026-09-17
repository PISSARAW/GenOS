'use strict';

const assert = require('assert');
const router = require('../src/services/philosophyRouter');
const { normalizeConcept } = require('../src/philosophy/conceptRegistry');

const concepts = router.listConcepts({ family: 'philosophy-of-mathematics' });
assert.ok(concepts.length >= 30);
assert.ok(concepts.every((concept) => concept.domain === 'mathematics'));
assert.ok(concepts.every((concept) => concept.serviceMaturity.executable === false));

const continuum = router.getConcept('mathematics.continuum-hypothesis');
assert.equal(continuum.aliases[0], 'CH');
assert.equal(continuum.status, 'disputed');

const neighborhood = router.getNeighborhood('mathematics.continuum-hypothesis');
assert.ok(neighborhood.relations.some((relation) => relation.relationType === 'independentFrom'));
assert.ok(neighborhood.neighbors.some((concept) => concept.id === 'mathematics.zfc'));

const platonism = normalizeConcept(router.getConcept('mathematics.platonism'));
assert.equal(platonism.family, 'philosophy-of-mathematics');
assert.equal(platonism.mapping, null);
assert.equal(platonism.serviceMaturity.level, 'conceptual');

const graph = router.exportGraph({ family: 'philosophy-of-mathematics' });
assert.ok(graph.nodes.length >= 30);
assert.ok(graph.edges.some((edge) => edge.relationType === 'independentFrom'));

console.log(`Mathematical philosophy registry tests passed (${concepts.length} concepts).`);
