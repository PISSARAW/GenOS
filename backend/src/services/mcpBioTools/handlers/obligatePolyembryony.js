/**
 * Biomimicry Handler: Obligate Polyembryony (Polyembryonie Obligatoire du Tatou)
 *
 * Simulates deterministic, mandatory monozygotic multi-cleavage producing
 * exactly 4 (or 8) strictly isogenic clone agents sharing equal budget fractions
 * and evaluating solutions under isogenic quorum rules.
 */

const crypto = require('crypto');

// In-memory registry of polyembryonic clusters
let POLYEMBRYONY_REGISTRY = new Map();

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function computeDnaHash(prompt) {
  return crypto.createHash('sha256').update(prompt || '').digest('hex').substring(0, 16);
}

function handleSpawn(args = {}) {
  const parentPrompt = args.parent_prompt || 'DEFAULT_POLAR_EXPLORATION_TASK';
  const totalBudget = args.total_budget_tokens === undefined ? 40000 : args.total_budget_tokens;
  const cleavageOrder = args.cleavage_order === undefined ? 4 : args.cleavage_order;
  if (!Number.isSafeInteger(totalBudget) || totalBudget < 1 || totalBudget > 1000000000) {
    return { configured: true, success: false, status: 'invalid_args', error: 'total_budget_tokens must be a safe integer from 1 to 1000000000.' };
  }
  if (cleavageOrder !== 4 && cleavageOrder !== 8) {
    return { configured: true, success: false, status: 'invalid_args', error: 'cleavage_order must be 4 or 8.' };
  }

  const clusterId = generateId('polyembryony_cluster');
  const dnaHash = computeDnaHash(parentPrompt);
  const budgetPerClone = Math.floor(totalBudget / cleavageOrder);

  const clones = [];
  for (let i = 0; i < cleavageOrder; i++) {
    clones.push({
      cloneId: generateId(`isogenic_clone_${i + 1}`),
      cloneIndex: i + 1,
      dnaHash,
      isogenicIdentity: 1.0,
      allocatedBudgetTokens: budgetPerClone,
      explorationSeed: Math.floor(Math.random() * 1000000),
      status: 'descriptor_only'
    });
  }

  const record = {
    clusterId,
    cleavageOrder,
    dnaHash,
    totalBudget,
    budgetPerClone,
    clones,
    createdAt: new Date().toISOString()
  };

  POLYEMBRYONY_REGISTRY.set(clusterId, record);

  return {
    configured: true,
    success: true,
    status: 'metadata_recorded',
    cluster_id: clusterId,
    cleavage_order: cleavageOrder,
    shared_dna_hash: dnaHash,
    budget_per_clone: budgetPerClone,
    clones_count: clones.length,
    clones,
    execution_scope: 'metadata_simulation',
    runtime_agents_created: false,
    output: `Recorded ${cleavageOrder} isogenic clone descriptors with nominal budget allocations of ${budgetPerClone} tokens each. No runtime agents were created.`
  };
}

function handleQuorum(args) {
  const clusterId = args.cluster_id;
  const cloneOutputs = args.clone_outputs || [];
  const record = POLYEMBRYONY_REGISTRY.get(clusterId);

  if (!record) {
    return {
      configured: true,
      success: false,
      status: 'not_found',
      error: `Polyembryonic cluster [${clusterId}] not found.`
    };
  }

  if (!Array.isArray(cloneOutputs) || cloneOutputs.length > record.cleavageOrder) {
    return { configured: true, success: false, status: 'invalid_args', error: 'clone_outputs must be an array with at most one vote per clone.' };
  }
  const knownCloneIds = new Set(record.clones.map(clone => clone.cloneId));
  const seenCloneIds = new Set();
  for (const item of cloneOutputs) {
    if (!item || typeof item.clone_id !== 'string' || !knownCloneIds.has(item.clone_id) || seenCloneIds.has(item.clone_id) ||
        typeof item.proposed_solution !== 'string' || !item.proposed_solution.trim()) {
      return { configured: true, success: false, status: 'invalid_args', error: 'Each vote must contain a unique known clone_id and a non-empty proposed_solution.' };
    }
    seenCloneIds.add(item.clone_id);
  }

  // Tally candidate solutions across isogenic clones
  const tallies = {};
  cloneOutputs.forEach(item => {
    const sol = item.proposed_solution || 'no_solution';
    tallies[sol] = (tallies[sol] || 0) + 1;
  });

  let topSolution = null;
  let maxVotes = 0;
  for (const [sol, count] of Object.entries(tallies)) {
    if (count > maxVotes) {
      maxVotes = count;
      topSolution = sol;
    }
  }

  const requiredThreshold = Math.ceil((record.cleavageOrder * 3) / 4); // 75% quorum threshold
  const isQuorumReached = (maxVotes >= requiredThreshold);

  return {
    configured: true,
    success: true,
    status: 'quorum_evaluated',
    cluster_id: clusterId,
    cleavage_order: record.cleavageOrder,
    votes_for_top_solution: maxVotes,
    required_quorum_threshold: requiredThreshold,
    quorum_reached: isQuorumReached,
    promoted_solution: isQuorumReached ? topSolution : null,
    consensus_ratio: maxVotes / record.cleavageOrder,
    execution_scope: 'metadata_simulation',
    runtime_promotion_applied: false,
    output: `Metadata quorum: ${maxVotes}/${record.cleavageOrder} distinct clone descriptors. ${isQuorumReached ? 'Threshold reached' : 'Threshold not reached'}; no runtime solution was promoted.`
  };
}

function handleStatus(args) {
  const clusterId = args.cluster_id;
  if (clusterId) {
    const record = POLYEMBRYONY_REGISTRY.get(clusterId);
    if (!record) return { configured: true, success: false, error: 'Not found' };
    return { configured: true, success: true, cluster: record };
  }

  const allClusters = Array.from(POLYEMBRYONY_REGISTRY.values()).map(r => ({
    clusterId: r.clusterId,
    cleavageOrder: r.cleavageOrder,
    totalBudget: r.totalBudget
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
    case 'spawn_obligate_clones':
      return handleSpawn(args);
    case 'evaluate_polyembryonic_quorum':
      return handleQuorum(args);
    case 'status':
    default:
      return handleStatus(args);
  }
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _obligatePolyembryonyRegistryPersistent = false;

function _ensureobligatePolyembryonyRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_obligatePolyembryonyRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::obligate_polyembryony', 'obligatePolyembryonyRegistry') : null;
    const mapToUse = stored && stored.size ? stored : POLYEMBRYONY_REGISTRY;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::obligate_polyembryony', 'obligatePolyembryonyRegistry', mapToUse) : mapToUse;
    POLYEMBRYONY_REGISTRY = persistentMap;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'POLYEMBRYONY_REGISTRY', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _obligatePolyembryonyRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensureobligatePolyembryonyRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.POLYEMBRYONY_REGISTRY || POLYEMBRYONY_REGISTRY;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensureobligatePolyembryonyRegistryPersistent();

module.exports = {
  handle,
  POLYEMBRYONY_REGISTRY,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
