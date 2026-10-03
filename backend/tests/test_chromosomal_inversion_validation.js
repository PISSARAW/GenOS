const assert = require('node:assert/strict');
const Module = require('node:module');
const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { handleChromosomalInversion } = require('../src/services/mcpBioTools/handlers/chromosomalInversion');
  for (const [start_index, end_index] of [[-1, 2], [1, 99], [0.5, 2], ['0', 2], [2, 1]]) {
    assert.equal(handleChromosomalInversion({ action: 'invert_chromosome_segment', start_index, end_index }).status, 'invalid_range');
  }
  const result = handleChromosomalInversion({ action: 'invert_chromosome_segment', id: 'inversion-check', start_index: 1, end_index: 2 });
  assert.equal(result.success, true);
  assert.equal(result.execution_scope, 'metadata_simulation');
  assert.equal(result.runtime_genome_changed, false);
  assert.deepEqual(result.segments, ['STEP_HYPOTHESIZE', 'STEP_DEDUCE', 'STEP_GATHER_EVIDENCE', 'STEP_VALIDATE_POSTCOND']);
} finally {
  Module._load = originalLoad;
}

console.log('chromosomal inversion validation passed');
