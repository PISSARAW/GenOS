const assert = require('node:assert/strict');
const Module = require('node:module');

const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { handleHybridMultiples } = require('../src/services/mcpBioTools/handlers/hybridMultiples');
  for (const archetypes of [
    Array(17).fill({ familyName: 'x', model: 'y', clonesPerFamily: 1 }),
    [{ familyName: 'x', model: 'y', clonesPerFamily: 129 }],
    [{ familyName: '', model: 'y' }],
    [{ familyName: 'x', model: 'y', clonesPerFamily: 1.5 }]
  ]) {
    assert.equal(handleHybridMultiples({ action: 'generate_hybrid_cluster', archetypes }).status, 'invalid_args');
  }

  const result = handleHybridMultiples({
    action: 'generate_hybrid_cluster', cluster_id: 'hybrid-check',
    archetypes: [{ familyName: 'A', model: 'model-a' }, { familyName: 'B', model: 'model-b', clonesPerFamily: 3 }]
  });
  assert.equal(result.total_agents_count, 5);
  assert.equal(result.execution_scope, 'metadata_simulation');
  assert.equal(result.runtime_agents_created, false);
  const dispersion = handleHybridMultiples({ action: 'evaluate_cluster_dispersion', cluster_id: 'hybrid-check' });
  assert.ok(!dispersion.output.includes('undefined'));
  assert.match(dispersion.output, /No empirical dispersion was evaluated/);
} finally {
  Module._load = originalLoad;
}

console.log('hybrid multiples validation passed');
