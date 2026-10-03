const assert = require('node:assert/strict');
const Module = require('node:module');

const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const { handle } = require('../src/services/mcpBioTools/handlers/heteropaternalSuperfecundation');
    for (const paternal_inseminators of [
      [], [{}], Array(17).fill({ father_id: 'f', provider: 'p', model: 'm', bias_domain: 'b' }),
      [{ father_id: 'same', provider: 'p', model: 'm', bias_domain: 'b' }, { father_id: 'same', provider: 'q', model: 'n', bias_domain: 'c' }]
    ]) {
      assert.equal((await handle({ action: 'heteropaternal_fertilize_and_spawn', paternal_inseminators })).status, 'invalid_args');
    }
    assert.equal((await handle({ action: 'heteropaternal_fertilize_and_spawn', shared_gestation_context: [] })).status, 'invalid_args');
    const result = await handle({ action: 'heteropaternal_fertilize_and_spawn' });
    assert.equal(result.offspring_descriptor_count, 2);
    assert.equal(result.execution_scope, 'metadata_simulation');
    assert.equal(result.runtime_agents_created, false);
    const evaluation = await handle({ action: 'evaluate_cognitive_diversity', cluster_id: result.cluster_id });
    assert.equal(evaluation.paternal_independence_guarantee, false);
    assert.match(evaluation.output, /were not tested/);
  } finally {
    Module._load = originalLoad;
  }
})().then(() => console.log('heteropaternal superfecundation validation passed'))
  .catch(error => { console.error(error); process.exitCode = 1; });
