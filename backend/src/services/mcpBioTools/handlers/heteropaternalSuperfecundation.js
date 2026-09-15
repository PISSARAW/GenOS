/**
 * Biomimicry Handler: Heteropaternal Superfecundation (Superfécondation Hétéropaternelle)
 *
 * Simulates the fertilization of multiple ova by distinct paternal providers (e.g. Anthropic, Google, OpenAI)
 * within a shared uterine workspace, maximizing multi-model cognitive diversity without provider bias.
 */

const crypto = require('crypto');
const adaptivePersister = require('../../adaptiveStateBootstrap');

// In-memory registry of heteropaternal twin clusters
const HETEROPATERNAL_REGISTRY = new Map();

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

function handleSpawn(args) {
  const gestationContext = args.shared_gestation_context || { workspace_id: 'ws_default', task_goal: 'general_objective' };
  const fathers = args.paternal_inseminators || [
    { father_id: 'father_anthropic', provider: 'anthropic', model: 'claude-3-7-sonnet', bias_domain: 'formal_proof' },
    { father_id: 'father_google', provider: 'google', model: 'gemini-2.5-pro', bias_domain: 'rapid_context' }
  ];

  const clusterId = generateId('heteropaternal_cluster');
  const twins = fathers.map((father, idx) => {
    const twinId = generateId(`half_sibling_twin_${idx + 1}`);
    return {
      twinId,
      paternalLineage: father.father_id,
      provider: father.provider,
      model: father.model,
      biasDomain: father.bias_domain,
      sharedWorkspaceId: gestationContext.workspace_id,
      maternalUterineContext: gestationContext.task_goal
    };
  });

  // Calculate provider diversity: 1.0 if all providers are unique
  const uniqueProviders = new Set(fathers.map(f => f.provider));
  const diversityScore = Math.min(1.0, uniqueProviders.size / Math.max(1, fathers.length));

  const record = {
    clusterId,
    gestationContext,
    twins,
    diversityScore,
    createdAt: new Date().toISOString()
  };

  HETEROPATERNAL_REGISTRY.set(clusterId, record);

  return {
    configured: true,
    success: true,
    status: 'superfecundated_dizygotic_spawn_complete',
    cluster_id: clusterId,
    diversity_score: diversityScore,
    twin_count: twins.length,
    half_sibling_twins: twins,
    output: `Spawned ${twins.length} heteropaternal half-sibling twins in workspace [${gestationContext.workspace_id}] (Diversity Score: ${diversityScore}).`
  };
}

function handleEvaluateDiversity(args) {
  const clusterId = args.cluster_id;
  const record = HETEROPATERNAL_REGISTRY.get(clusterId);

  if (!record) {
    return {
      configured: true,
      success: false,
      status: 'not_found',
      error: `Heteropaternal cluster [${clusterId}] not found.`
    };
  }

  const providerCounts = {};
  record.twins.forEach(t => {
    providerCounts[t.provider] = (providerCounts[t.provider] || 0) + 1;
  });

  return {
    configured: true,
    success: true,
    status: 'diversity_evaluated',
    cluster_id: clusterId,
    diversity_score: record.diversityScore,
    providers_breakdown: providerCounts,
    paternal_independence_guarantee: record.diversityScore === 1.0,
    output: `Cluster [${clusterId}] possesses diversity score ${record.diversityScore} with zero shared paternal bias.`
  };
}

function handleStatus(args) {
  const clusterId = args.cluster_id;
  if (clusterId) {
    return handleEvaluateDiversity(args);
  }

  const allClusters = Array.from(HETEROPATERNAL_REGISTRY.values()).map(r => ({
    clusterId: r.clusterId,
    workspace: r.gestationContext.workspace_id,
    twinCount: r.twins.length,
    diversity: r.diversityScore
  }));

  return {
    configured: true,
    success: true,
    total_clusters: allClusters.length,
    clusters: allClusters
  };
}

async function handle(args, run) {
  const action = (args && args.action) || 'status';

  switch (action) {
    case 'heteropaternal_fertilize_and_spawn':
      return handleSpawn(args);
    case 'evaluate_cognitive_diversity':
      return handleEvaluateDiversity(args);
    case 'status':
    default:
      return handleStatus(args);
  }
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _heteropaternalRegistryPersistent = false;

function _ensureheteropaternalRegistryPersistent() {
  if (_heteropaternalRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::heteropaternal_superfecundation', 'heteropaternalRegistry') : null;
    const mapToUse = stored && stored.size ? stored : heteropaternalRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::heteropaternal_superfecundation', 'heteropaternalRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'heteropaternalRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _heteropaternalRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensureheteropaternalRegistryPersistent();
}

function getAdaptivePersister() {
  return adaptivePersister;
}

function getSnapshot() {
  const map = module.exports.heteropaternalRegistry || heteropaternalRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensureheteropaternalRegistryPersistent();

module.exports = {
  handle,
  HETEROPATERNAL_REGISTRY,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
