/**
 * Biomimicry Handler: Heteropaternal Superfecundation (Superfécondation Hétéropaternelle)
 *
 * Simulates the fertilization of multiple ova by distinct paternal providers (e.g. Anthropic, Google, OpenAI)
 * within a shared uterine workspace, maximizing multi-model cognitive diversity without provider bias.
 */

const crypto = require('crypto');

// In-memory registry of heteropaternal twin clusters
let HETEROPATERNAL_REGISTRY = new Map();

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function handleSpawn(args = {}) {
  const gestationContext = args.shared_gestation_context === undefined ? { workspace_id: 'ws_default', task_goal: 'general_objective' } : args.shared_gestation_context;
  const fathers = args.paternal_inseminators === undefined ? [
    { father_id: 'father_anthropic', provider: 'anthropic', model: 'claude-3-7-sonnet', bias_domain: 'formal_proof' },
    { father_id: 'father_google', provider: 'google', model: 'gemini-2.5-pro', bias_domain: 'rapid_context' }
  ] : args.paternal_inseminators;
  const validText = (value, maxLength) => typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
  if (!gestationContext || typeof gestationContext !== 'object' || Array.isArray(gestationContext) ||
      !validText(gestationContext.workspace_id, 120) || !validText(gestationContext.task_goal, 2000)) {
    return { configured: true, success: false, status: 'invalid_args', error: 'shared_gestation_context must include a workspace_id (max 120 chars) and task_goal (max 2000 chars).' };
  }
  if (!Array.isArray(fathers) || fathers.length < 2 || fathers.length > 16 || fathers.some(father => !father ||
      !validText(father.father_id, 120) || !validText(father.provider, 80) ||
      !validText(father.model, 120) || !validText(father.bias_domain, 120)) ||
      new Set(fathers.map(father => father.father_id)).size !== fathers.length) {
    return { configured: true, success: false, status: 'invalid_args', error: 'paternal_inseminators must contain 2 to 16 entries with unique father_id and non-empty provider, model, and bias_domain.' };
  }

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
    status: 'metadata_recorded',
    cluster_id: clusterId,
    diversity_score: diversityScore,
    twin_count: twins.length,
    half_sibling_twins: twins,
    offspring_descriptor_count: twins.length,
    execution_scope: 'metadata_simulation',
    runtime_agents_created: false,
    output: `Recorded ${twins.length} paternal lineage descriptors in workspace [${gestationContext.workspace_id}] (provider diversity: ${diversityScore}). No runtime agents were created.`
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
    paternal_independence_guarantee: false,
    execution_scope: 'metadata_simulation',
    output: `Cluster [${clusterId}] metadata has provider diversity score ${record.diversityScore}; paternal independence and bias separation were not tested.`
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
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_heteropaternalRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::heteropaternal_superfecundation', 'heteropaternalRegistry') : null;
    const mapToUse = stored && stored.size ? stored : HETEROPATERNAL_REGISTRY;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::heteropaternal_superfecundation', 'heteropaternalRegistry', mapToUse) : mapToUse;
    HETEROPATERNAL_REGISTRY = persistentMap;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'HETEROPATERNAL_REGISTRY', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _heteropaternalRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensureheteropaternalRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.HETEROPATERNAL_REGISTRY || HETEROPATERNAL_REGISTRY;
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
