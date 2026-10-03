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
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  if (request === '../../crossAgentRelationalService') {
    return { createRelation: async () => {}, stableRelationId: (...parts) => parts.join(':') };
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const dynamic = require('../src/services/mcpBioTools/handlers/dynamicTripletExpansion');
  const frameshift = require('../src/services/mcpBioTools/handlers/frameshiftMutation');
  const tissue = require('../src/services/mcpBioTools/handlers/tissueChimerism');
  const monozygotic = require('../src/services/mcpBioTools/handlers/monozygoticSplit');
  const hybrid = require('../src/services/mcpBioTools/handlers/hybridMultiples');
  const obligate = require('../src/services/mcpBioTools/handlers/obligatePolyembryony');
  const heteropaternal = require('../src/services/mcpBioTools/handlers/heteropaternalSuperfecundation');
  const mirrorTwin = require('../src/services/mcpBioTools/handlers/mirrorTwinFork');
  const polyovulation = require('../src/services/mcpBioTools/handlers/polyovulationSpawn');
  const sesquizygotic = require('../src/services/mcpBioTools/handlers/sesquizygoticSplit');
  const point = require('../src/services/mcpBioTools/handlers/pointMutation');
  const chimera = require('../src/services/mcpBioTools/handlers/chimericMerge');
  const conjoined = require('../src/services/mcpBioTools/handlers/conjoinedTwinBind');
  const marmoset = require('../src/services/mcpBioTools/handlers/marmosetGermlineChimerism');

  dynamic.handleDynamicTripletExpansion({ id: 'persistent-dynamic', action: 'replicate_generation', delta_repeats: 1 });
  frameshift.handleFrameshiftMutation({ id: 'persistent-frameshift', action: 'insert_token_frameshift' });
  tissue.handle({ action: 'create_tissue_chimeric_agent', agent_id: 'persistent-tissue' });
  monozygotic.handleMonozygoticSplit({ action: 'cleave_monozygotic_twins', cluster_id: 'persistent-mono' });
  hybrid.handleHybridMultiples({ action: 'generate_hybrid_cluster', cluster_id: 'persistent-hybrid' });
  obligate.handle({ action: 'spawn_obligate_clones', parent_prompt: 'persistent-poly' });
  heteropaternal.handle({ action: 'heteropaternal_fertilize_and_spawn' });
  mirrorTwin.handleMirrorTwinFork({ action: 'fork_mirror_pair', pair_id: 'persistent-mirror' });
  polyovulation.handlePolyovulationSpawn({ action: 'spawn_dizygotic_fleet', fleet_id: 'persistent-polyovulation' });
  sesquizygotic.SESQUIZYGOTIC_REGISTRY.set('persistent-sesqui', { pairId: 'persistent-sesqui', twins: [] });
  point.handlePointMutation({ action: 'apply_substitution', id: 'persistent-point' });
  chimera.handleChimericMerge({ action: 'status', mosaic_id: 'persistent-chimera' });
  conjoined.handleConjoinedTwinBind({ action: 'status', pair_id: 'persistent-conjoined' });
  marmoset.MARMOSET_REGISTRY.set('persistent-marmoset', {
    exchangeId: 'persistent-marmoset', donorTwinId: 'donor', proxyTwinId: 'proxy', descendants: []
  });

  assert.ok(dynamic.getSnapshot()['persistent-dynamic']);
  assert.ok(frameshift.getSnapshot()['persistent-frameshift']);
  assert.ok(tissue.getSnapshot()['persistent-tissue']);
  assert.ok(monozygotic.getSnapshot()['persistent-mono']);
  assert.ok(hybrid.getSnapshot()['persistent-hybrid']);
  assert.ok(Object.keys(obligate.getSnapshot()).length);
  assert.ok(Object.keys(heteropaternal.getSnapshot()).length);
  assert.ok(mirrorTwin.getSnapshot()['persistent-mirror']);
  assert.ok(polyovulation.getSnapshot()['persistent-polyovulation']);
  assert.ok(sesquizygotic.getSnapshot()['persistent-sesqui']);
  assert.ok(point.getSnapshot()['persistent-point']);
  assert.ok(chimera.getSnapshot()['persistent-chimera']);
  assert.ok(conjoined.getSnapshot()['persistent-conjoined']);
  assert.ok(marmoset.getSnapshot()['persistent-marmoset']);
  assert.deepEqual(registryBindings.map(({ name }) => name), [
    'dynamicTripletExpansionRegistry',
    'frameshiftMutationRegistry',
    'tissueChimerismRegistry',
    'monozygoticRegistry',
    'hybridMultiplesRegistry',
    'obligatePolyembryonyRegistry',
    'heteropaternalRegistry',
    'mirrorTwinRegistry',
    'dizygoticFleetRegistry',
    'SESQUIZYGOTIC_REGISTRY',
    'pointMutationRegistry',
    'chimericRegistry',
    'conjoinedTwinRegistry',
    'marmosetGermlineRegistry'
  ]);
} finally {
  Module._load = originalLoad;
}

console.log('biomimicry registry persistence bindings passed');
