const assert = require('node:assert/strict');
const Module = require('node:module');

const registryBindings = [];
const fakePersister = {
  getMcpBiomimicryRegistry: () => null,
  makePersistentMap: (scope, name, registry) => {
    registryBindings.push({ scope, name, registry });
    return registry;
  }
};
const fakeBootstrap = {
  getAdaptivePersister: () => fakePersister,
  setAdaptivePersister: () => {}
};
const originalLoad = Module._load;
Module._load = function loadWithFakePersister(request, parent, isMain) {
  return request === '../../adaptiveStateBootstrap'
    ? fakeBootstrap
    : originalLoad.call(this, request, parent, isMain);
};

try {
  const dynamic = require('../src/services/mcpBioTools/handlers/dynamicTripletExpansion');
  const frameshift = require('../src/services/mcpBioTools/handlers/frameshiftMutation');
  const tissue = require('../src/services/mcpBioTools/handlers/tissueChimerism');
  const monozygotic = require('../src/services/mcpBioTools/handlers/monozygoticSplit');
  const hybrid = require('../src/services/mcpBioTools/handlers/hybridMultiples');
  const obligate = require('../src/services/mcpBioTools/handlers/obligatePolyembryony');
  const heteropaternal = require('../src/services/mcpBioTools/handlers/heteropaternalSuperfecundation');

  dynamic.handleDynamicTripletExpansion({ id: 'persistent-dynamic', action: 'replicate_generation', delta_repeats: 1 });
  frameshift.handleFrameshiftMutation({ id: 'persistent-frameshift', action: 'insert_token_frameshift' });
  tissue.handle({ action: 'create_tissue_chimeric_agent', agent_id: 'persistent-tissue' });
  monozygotic.handleMonozygoticSplit({ action: 'cleave_monozygotic_twins', cluster_id: 'persistent-mono' });
  hybrid.handleHybridMultiples({ action: 'generate_hybrid_cluster', cluster_id: 'persistent-hybrid' });
  obligate.handle({ action: 'spawn_obligate_clones', parent_prompt: 'persistent-poly' });
  heteropaternal.handle({ action: 'heteropaternal_fertilize_and_spawn' });

  assert.ok(dynamic.getSnapshot()['persistent-dynamic']);
  assert.ok(frameshift.getSnapshot()['persistent-frameshift']);
  assert.ok(tissue.getSnapshot()['persistent-tissue']);
  assert.ok(monozygotic.getSnapshot()['persistent-mono']);
  assert.ok(hybrid.getSnapshot()['persistent-hybrid']);
  assert.ok(Object.keys(obligate.getSnapshot()).length);
  assert.ok(Object.keys(heteropaternal.getSnapshot()).length);
  assert.deepEqual(registryBindings.map(({ name }) => name), [
    'dynamicTripletExpansionRegistry',
    'frameshiftMutationRegistry',
    'tissueChimerismRegistry',
    'monozygoticRegistry',
    'hybridMultiplesRegistry',
    'obligatePolyembryonyRegistry',
    'heteropaternalRegistry'
  ]);
} finally {
  Module._load = originalLoad;
}

console.log('biomimicry registry persistence bindings passed');
