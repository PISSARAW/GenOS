'use strict';
const assert = require('node:assert/strict');
const matrix = require('../src/services/capabilityAccessMatrix');
const runtime = require('../src/services/conceptRegistryService');
const graph = require('../src/services/capabilityGraphService');
const registry = require('../src/services/ontogenesis/canonicalConceptRegistry');

const original = { matrix: matrix.fullMatrix, runtime: runtime.getAllConcepts, graph: graph.getAllConcepts };
const counts = { matrix: 0, runtime: 0, graph: 0 };
let state = 'operationnel';
matrix.fullMatrix = () => {
  counts.matrix += 1;
  return [{ capability: 'TEMP_PERMISSION_PROBE', state, catalogued: ['genos_echo'], service: 'probe' }];
};
runtime.getAllConcepts = () => { counts.runtime += 1; return original.runtime(); };
graph.getAllConcepts = () => { counts.graph += 1; return original.graph(); };

try {
  const references = ['temp_permission_probe', 'unknown_snapshot_probe'];
  const first = registry.resolveConceptReferences(references);
  assert.equal(first[0].source, 'capability');
  assert.equal(first[0].available, true);
  assert.equal(first[1].source, 'unknown');
  assert.deepEqual(counts, { matrix: 1, runtime: 1, graph: 1 });
  state = 'partiel';
  const second = registry.resolveConceptReferences(references);
  assert.equal(second[0].available, false, 'a previous permission snapshot must not survive another resolution');
  assert.equal(second[0].executable, false);
  assert.equal(second[0].reason, 'capacite-partiel');
  assert.deepEqual(counts, { matrix: 2, runtime: 2, graph: 2 });
  assert.equal(first[0].available, true, 'later resolution must not mutate previous output');
  console.log('Canonical resolution snapshots are per-call; capability changes remain visible without repeated registry reads.');
} finally {
  matrix.fullMatrix = original.matrix;
  runtime.getAllConcepts = original.runtime;
  graph.getAllConcepts = original.graph;
}
