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
  const superfetation = require('../src/services/mcpBioTools/handlers/superfetationPipeline');
  const fetusInFetu = require('../src/services/mcpBioTools/handlers/fetusInFetu');
  const aneuploidy = require('../src/services/mcpBioTools/handlers/aneuploidy');
  const polyploidy = require('../src/services/mcpBioTools/handlers/polyploidy');
  const deletion = require('../src/services/mcpBioTools/handlers/chromosomalDeletion');
  const duplication = require('../src/services/mcpBioTools/handlers/chromosomalDuplication');
  const inversion = require('../src/services/mcpBioTools/handlers/chromosomalInversion');
  const translocation = require('../src/services/mcpBioTools/handlers/chromosomalTranslocation');
  const transposon = require('../src/services/mcpBioTools/handlers/transposonJump');
  const mtdna = require('../src/services/mcpBioTools/handlers/mitochondrialDnaMutation');
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
  superfetation.SUPERFETATION_REGISTRY.set('persistent-superfetation', { pipelineId: 'persistent-superfetation' });
  fetusInFetu.FETUS_REGISTRY.set('persistent-host', { hostId: 'persistent-host', fetusId: 'persistent-fetus' });
  aneuploidy.handleAneuploidy({ action: 'induce_trisomy', id: 'persistent-aneuploidy' });
  polyploidy.handlePolyploidy({ action: 'multiply_genome_ploidy', id: 'persistent-polyploidy' });
  deletion.handleChromosomalDeletion({ action: 'delete_chromosome_segment', id: 'persistent-deletion' });
  duplication.handleChromosomalDuplication({ action: 'duplicate_chromosome_segment', id: 'persistent-duplication' });
  inversion.handleChromosomalInversion({ action: 'invert_chromosome_segment', id: 'persistent-inversion', start_index: 0, end_index: 1 });
  translocation.handleChromosomalTranslocation({ action: 'translocate_segment', source_agent_id: 'persistent-source', target_agent_id: 'persistent-target' });
  transposon.handleTransposonJump({ action: 'copy_and_paste_retrojump', id: 'persistent-transposon' });
  mtdna.handleMitochondrialDnaMutation({ action: 'mutate_mtdna_under_stress', id: 'persistent-mtdna' });
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
  assert.ok(superfetation.getSnapshot()['persistent-superfetation']);
  assert.ok(fetusInFetu.getSnapshot()['persistent-host']);
  assert.ok(aneuploidy.getSnapshot()['persistent-aneuploidy']);
  assert.ok(polyploidy.getSnapshot()['persistent-polyploidy']);
  assert.ok(deletion.getSnapshot()['persistent-deletion']);
  assert.ok(duplication.getSnapshot()['persistent-duplication']);
  assert.ok(inversion.getSnapshot()['persistent-inversion']);
  assert.ok(translocation.getSnapshot()['persistent-source']);
  assert.ok(transposon.getSnapshot()['persistent-transposon']);
  assert.ok(mtdna.getSnapshot()['persistent-mtdna']);
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
    'SUPERFETATION_REGISTRY',
    'FETUS_REGISTRY',
    'aneuploidyRegistry',
    'polyploidyRegistry',
    'chromosomalDeletionRegistry',
    'chromosomalDuplicationRegistry',
    'chromosomalInversionRegistry',
    'chromosomalTranslocationRegistry',
    'transposonRegistry',
    'mtdnaRegistry',
    'pointMutationRegistry',
    'chimericRegistry',
    'conjoinedTwinRegistry',
    'marmosetGermlineRegistry'
  ]);
} finally {
  Module._load = originalLoad;
}

console.log('biomimicry registry persistence bindings passed');
