/**
 * Biomimicry Handler: Obligate Polyembryony (Polyembryonie Obligatoire du Tatou)
 *
 * Simulates deterministic, mandatory monozygotic multi-cleavage producing
 * exactly 4 (or 8) strictly isogenic clone agents sharing equal budget fractions
 * and evaluating solutions under isogenic quorum rules.
 */

const crypto = require('crypto');

// In-memory registry of polyembryonic clusters
const POLYEMBRYONY_REGISTRY = new Map();

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

function computeDnaHash(prompt) {
  return crypto.createHash('sha256').update(prompt || '').digest('hex').substring(0, 16);
}

function handleSpawn(args) {
  const parentPrompt = args.parent_prompt || 'DEFAULT_POLAR_EXPLORATION_TASK';
  const totalBudget = args.total_budget_tokens || 40000;
  const cleavageOrder = (args.cleavage_order === 8) ? 8 : 4; // 4 (quadruplets) or 8 (octuplets)

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
      status: 'active'
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
    status: 'obligate_polyembryony_cleaved',
    cluster_id: clusterId,
    cleavage_order: cleavageOrder,
    shared_dna_hash: dnaHash,
    budget_per_clone: budgetPerClone,
    clones_count: clones.length,
    clones,
    output: `Mandatory polyembryony: Zygote cleaved into ${cleavageOrder} isogenic clones (Budget: ${budgetPerClone} tokens each).`
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
    output: `Polyembryonic quorum: ${maxVotes}/${record.cleavageOrder} votes. Quorum ${isQuorumReached ? 'ACHIEVED' : 'FAILED'}.`
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

module.exports = {
  handle,
  POLYEMBRYONY_REGISTRY
};
