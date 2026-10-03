const assert = require('node:assert/strict');
const Module = require('node:module');

const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { handleMonozygoticSplit } = require('../src/services/mcpBioTools/handlers/monozygoticSplit');
  for (const clone_count of [1, 1.5, 'abc', 129, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(handleMonozygoticSplit({ action: 'cleave_monozygotic_twins', clone_count }).status, 'invalid_args');
  }
  for (const seeds of ['bad', Array(129).fill(7), [1, 1.1]]) {
    assert.equal(handleMonozygoticSplit({ action: 'cleave_monozygotic_twins', seeds }).status, 'invalid_args');
  }
  const result = handleMonozygoticSplit({ action: 'cleave_monozygotic_twins', cluster_id: 'mono-check', clone_count: 3, seeds: [] });
  assert.equal(result.clone_count, 3);
  assert.equal(result.execution_scope, 'metadata_simulation');
  assert.equal(result.runtime_agents_created, false);
  assert.equal(result.clones[0].seed, 101);
} finally {
  Module._load = originalLoad;
}

console.log('monozygotic split validation passed');
