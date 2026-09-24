const crypto = require('crypto');
const { quoteCliArg } = require('../shellQuote');
const { createRelation, stableRelationId } = require('../../crossAgentRelationalService');

// State registry for chimeric mosaic agents
const chimericRegistry = new Map(); /* persisterHook: chimericRegistry */

function getMosaic(mosaicId) {
  if (!chimericRegistry.has(mosaicId)) {
    chimericRegistry.set(mosaicId, {
      mosaicId,
      lineageGenomeId: null,     // Primary functional genome (Branch A)
      lineageEpigenomeId: null,  // Synaptic memory & error-avoidance vaccine (Branch B)
      compositeTraits: {},
      coherenceScore: 1.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'uninitialized'
    });
  }
  return chimericRegistry.get(mosaicId);
}

async function handleChimericMerge(args = {}, run) {
  const action = args.action || 'status';
  const mosaicId = args.mosaic_id || `mosaic-${Date.now()}`;
  const branchGenome = args.branch_genome || args.genome_branch_id || 'branch-functional-A';
  const branchEpigenome = args.branch_epigenome || args.memory_branch_id || 'branch-experience-B';
  const toolsProvided = Array.isArray(args.tools) ? args.tools : ['tool_core_execution', 'tool_ast_refactor'];
  const vaccinesProvided = Array.isArray(args.vaccines) ? args.vaccines : ['vaccine_null_deref', 'vaccine_timeout_guard'];

  let cliOutput = null;
  let cliFailed = false;
  let cliErrorText = null;
  if (typeof run === 'function') {
    try {
      const out = run(`genos biomimicry bio-feature --feature chimeric_merge --action ${quoteCliArg(action)} --param mosaic_id=${quoteCliArg(mosaicId)}`);
      cliOutput = out ? out.toString() : null;
    } catch (cliProbeError) { cliFailed = true; cliErrorText = cliProbeError && cliProbeError.message ? cliProbeError.message : String(cliProbeError); }
  }
  if (cliFailed) {
    return { configured: true, success: false, status: 'tool_error', error: cliErrorText };
  }

  const mosaic = getMosaic(mosaicId);

  if (action === 'fuse_mosaic') {
    await Promise.all([
      createRelation({
        id: stableRelationId('chimera', `mosaic:${mosaicId}:${branchGenome}`), sourceAgentId: branchGenome,
        targetAgentId: mosaicId, relationType: 'chimera', organizationId: args.organization_id, projectId: args.project_id,
        metadata: { mosaicId, subtype: 'functional_genome_origin' }
      }),
      createRelation({
        id: stableRelationId('chimera', `mosaic:${mosaicId}:${branchEpigenome}`), sourceAgentId: branchEpigenome,
        targetAgentId: mosaicId, relationType: 'chimera', organizationId: args.organization_id, projectId: args.project_id,
        metadata: { mosaicId, subtype: 'epigenetic_memory_origin' }
      })
    ]);
    mosaic.lineageGenomeId = branchGenome;
    mosaic.lineageEpigenomeId = branchEpigenome;

    const hybridDnaHash = crypto.createHash('sha256')
      .update(`${branchGenome}::${branchEpigenome}::${JSON.stringify(toolsProvided)}::${JSON.stringify(vaccinesProvided)}`)
      .digest('hex');

    mosaic.compositeTraits = {
      hybridDnaHash,
      functionalGenome: {
        sourceBranch: branchGenome,
        activeTools: toolsProvided,
        reasoningStrategy: args.reasoning_strategy || 'PARALLEL_TREE_SEARCH'
      },
      epigeneticImmuneMemory: {
        sourceBranch: branchEpigenome,
        synapticPruningRules: args.pruning_rules || ['prune_dead_ends', 'reinforce_verified_claims'],
        activeVaccines: vaccinesProvided
      },
      tetragameticHeritage: {
        paternalEmbryoLineage: branchGenome,
        maternalEmbryoLineage: branchEpigenome,
        mosaicComposition: '50% Functional Genome / 50% Epigenetic Memory'
      }
    };

    mosaic.coherenceScore = 0.98;
    mosaic.status = 'fused_mosaic_active';
    mosaic.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'mosaic_fused',
      transport: 'tetragametic_chimeric_recombinator',
      mosaic_id: mosaicId,
      hybrid_dna_hash: hybridDnaHash,
      heritage: mosaic.compositeTraits.tetragameticHeritage,
      functional_tools_count: toolsProvided.length,
      immune_vaccines_count: vaccinesProvided.length,
      coherence_score: mosaic.coherenceScore,
      output: `Chimeric mosaic agent '${mosaicId}' synthesized. Inherits tools from '${branchGenome}' and immune memory from '${branchEpigenome}'.`
    };
  }

  if (action === 'inspect_mosaic_heritage') {
    return {
      configured: true,
      success: true,
      status: 'heritage_inspected',
      transport: 'tetragametic_chimeric_recombinator',
      mosaic_id: mosaicId,
      lineages: {
        functional_genome_origin: mosaic.lineageGenomeId,
        epigenetic_origin: mosaic.lineageEpigenomeId
      },
      composite_traits: mosaic.compositeTraits,
      coherence_score: mosaic.coherenceScore,
      output: `Mosaic '${mosaicId}' carries tetragametic duality: DNA from ${mosaic.lineageGenomeId}, Synapses from ${mosaic.lineageEpigenomeId}.`
    };
  }

  if (action === 'verify_mosaic_coherence') {
    const isCoherent = !!(mosaic.lineageGenomeId && mosaic.lineageEpigenomeId && mosaic.compositeTraits.hybridDnaHash);
    const score = isCoherent ? 0.99 : 0.20;

    return {
      configured: true,
      success: isCoherent,
      status: isCoherent ? 'coherence_verified' : 'coherence_failed',
      transport: 'tetragametic_chimeric_recombinator',
      mosaic_id: mosaicId,
      structural_coherence: isCoherent,
      coherence_score: score,
      validation_passed: isCoherent,
      output: isCoherent
        ? `Tetragametic mosaic coherence verified (Score: ${score}). No rejection reaction between lineages.`
        : `Mosaic coherence check failed: incomplete dual heritage.`
    };
  }

  // Default: status
  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'tetragametic_chimeric_recombinator',
    mosaic_id: mosaicId,
    mosaic_state: mosaic,
    output: `Chimeric mosaic '${mosaicId}' status: ${mosaic.status} (Lineages: ${mosaic.lineageGenomeId} + ${mosaic.lineageEpigenomeId}).`
  };
}

function handleChimericMergeError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'tetragametic_chimeric_recombinator',
    output: e.stdout ? e.stdout.toString() : e.message
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _chimericRegistryPersistent = false;

function _ensurechimericRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_chimericRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::chimeric_merge', 'chimericRegistry') : null;
    const mapToUse = stored && stored.size ? stored : chimericRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::chimeric_merge', 'chimericRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'chimericRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _chimericRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensurechimericRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.chimericRegistry || chimericRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensurechimericRegistryPersistent();

module.exports = {
  handleChimericMerge,
  handleChimericMergeError,
  chimericRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
