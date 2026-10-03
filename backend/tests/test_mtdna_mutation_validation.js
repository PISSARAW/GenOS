const assert = require('node:assert/strict');
const Module = require('node:module');
const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { handleMitochondrialDnaMutation } = require('../src/services/mcpBioTools/handlers/mitochondrialDnaMutation');
  for (const stress_level of ['high', NaN, Infinity, 0, 5.1]) {
    assert.equal(handleMitochondrialDnaMutation({ action: 'mutate_mtdna_under_stress', id: 'invalid-mtdna', stress_level }).status, 'invalid_args');
  }
  const result = handleMitochondrialDnaMutation({ action: 'mutate_mtdna_under_stress', id: 'valid-mtdna', stress_level: 2 });
  assert.equal(result.new_mutations, 4);
  assert.equal(result.execution_scope, 'metadata_simulation');
  assert.equal(result.runtime_genome_changed, false);
  assert.equal(handleMitochondrialDnaMutation({ action: 'transmit_maternal_lineage', id: 'same-id', child_id: 'same-id' }).status, 'invalid_args');
  const child = handleMitochondrialDnaMutation({ action: 'transmit_maternal_lineage', id: 'mother', child_id: 'child' });
  assert.equal(child.paternal_mtdna_purged, false);
  assert.equal(child.runtime_genome_changed, false);
} finally {
  Module._load = originalLoad;
}

console.log('mtDNA mutation validation passed');
