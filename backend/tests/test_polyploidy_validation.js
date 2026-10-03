const assert = require('node:assert/strict');
const Module = require('node:module');
const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { handlePolyploidy } = require('../src/services/mcpBioTools/handlers/polyploidy');
  for (const ploidy_level of [0, 2.5, 5, 9, '4', Number.MAX_SAFE_INTEGER]) {
    assert.equal(handlePolyploidy({ action: 'multiply_genome_ploidy', id: `invalid-${ploidy_level}`, ploidy_level }).status, 'invalid_args');
  }
  const result = handlePolyploidy({ action: 'multiply_genome_ploidy', id: 'ploid-check', ploidy_level: 6 });
  assert.equal(result.ploidy_level, 6);
  assert.equal(result.layers_count, 6);
  assert.equal(result.execution_scope, 'metadata_simulation');
  assert.equal(result.runtime_genome_changed, false);
  const orchestrated = handlePolyploidy({ action: 'orchestrate_polyploid_layers', id: 'ploid-check' });
  assert.equal(orchestrated.runtime_orchestration_started, false);
} finally {
  Module._load = originalLoad;
}

console.log('polyploidy validation passed');
