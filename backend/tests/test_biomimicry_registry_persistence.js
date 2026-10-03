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

  dynamic.handleDynamicTripletExpansion({ id: 'persistent-dynamic', action: 'replicate_generation', delta_repeats: 1 });
  frameshift.handleFrameshiftMutation({ id: 'persistent-frameshift', action: 'insert_token_frameshift' });
  tissue.handle({ action: 'create_tissue_chimeric_agent', agent_id: 'persistent-tissue' });

  assert.ok(dynamic.getSnapshot()['persistent-dynamic']);
  assert.ok(frameshift.getSnapshot()['persistent-frameshift']);
  assert.ok(tissue.getSnapshot()['persistent-tissue']);
  assert.deepEqual(registryBindings.map(({ name }) => name), [
    'dynamicTripletExpansionRegistry',
    'frameshiftMutationRegistry',
    'tissueChimerismRegistry'
  ]);
} finally {
  Module._load = originalLoad;
}

console.log('biomimicry registry persistence bindings passed');
