const { probeBioFeature } = require('../featureProbe');
const crypto = require('crypto');
const { quoteCliArg } = require('../shellQuote');

// Registry for active monozygotic split clusters
let monozygoticClusterRegistry = new Map();

function getCluster(clusterId) {
  if (!monozygoticClusterRegistry.has(clusterId)) {
    monozygoticClusterRegistry.set(clusterId, {
      clusterId,
      parentGenomeId: 'gen-zygote-root',
      lineageId: 'lin-monozygote',
      snapshotId: 'snp-cleavage-origin',
      clones: [],
      divergenceMetrics: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return monozygoticClusterRegistry.get(clusterId);
}

function handleMonozygoticSplit(args = {}, run) {
  const options = monozygoticSplitOptions(args);
  if (options.status === 'invalid_args') return options;
  const { action, clusterId, parentGenomeId, snapshotId, requestedCloneCount, cloneCount, explorationSeeds } = options;

  const { cliOutput, cliFailed, cliErrorText } = probeBioFeature(run, `genos biomimicry bio-feature --feature monozygotic_split --action ${quoteCliArg(action)} --param cluster_id=${quoteCliArg(clusterId)}`);
  if (cliFailed) {
    return { configured: true, success: false, status: 'tool_error', error: cliErrorText };
  }

  const cluster = getCluster(clusterId);

  if (action === 'cleave_monozygotic_twins') {
    return MonozygoticSplitCleaveMonozygoticTwins({ args, action, clusterId, parentGenomeId, snapshotId, requestedCloneCount, cloneCount, explorationSeeds, cluster, cliOutput, cliFailed, cliErrorText });
  }

  if (action === 'synchronize_cleavage_state') {
    return MonozygoticSplitSynchronizeCleavageState({ args, action, clusterId, parentGenomeId, snapshotId, requestedCloneCount, cloneCount, explorationSeeds, cluster, cliOutput, cliFailed, cliErrorText });
  }

  // Default: status
  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'isogenic_cleavage_plane',
    cluster_id: clusterId,
    clone_count: cluster.clones.length,
    clones: cluster.clones,
    output: `Monozygotic cluster '${clusterId}' active with ${cluster.clones.length} isogenic clone(s).`
  };
}

function handleMonozygoticSplitError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'isogenic_cleavage_plane',
    output: e.stdout ? e.stdout.toString() : e.message
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _monozygoticRegistryPersistent = false;

function _ensuremonozygoticRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_monozygoticRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::monozygotic_split', 'monozygoticRegistry') : null;
    const mapToUse = stored && stored.size ? stored : monozygoticClusterRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::monozygotic_split', 'monozygoticRegistry', mapToUse) : mapToUse;
    monozygoticClusterRegistry = persistentMap;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'monozygoticClusterRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _monozygoticRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensuremonozygoticRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.monozygoticClusterRegistry || monozygoticClusterRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensuremonozygoticRegistryPersistent();

module.exports = {
  handleMonozygoticSplit,
  handleMonozygoticSplitError,
  monozygoticClusterRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};

function MonozygoticSplitCleaveMonozygoticTwins({ args, action, clusterId, parentGenomeId, snapshotId, requestedCloneCount, cloneCount, explorationSeeds, cluster, cliOutput, cliFailed, cliErrorText }) {
  cluster.parentGenomeId = parentGenomeId;
  cluster.snapshotId = snapshotId;
  cluster.lineageId = `lin-mono-${crypto.createHash('md5').update(parentGenomeId).digest('hex').slice(0, 6)}`;

  // Generate N identical clones sharing 100% genome DNA and baseline memory snapshot
  cluster.clones = [];
  for (let i = 0; i < cloneCount; i++) {
    const seed = explorationSeeds.length ? explorationSeeds[i % explorationSeeds.length] : (i + 1) * 101;
    const cloneId = `twin-clone-${i + 1}-${crypto.createHash('sha256').update(clusterId + i).digest('hex').slice(0, 6)}`;

    cluster.clones.push({
      cloneId,
      parentGenomeId,
      genomeDnaHash: crypto.createHash('sha256').update(parentGenomeId + snapshotId).digest('hex'),
      lineageId: cluster.lineageId,
      generation: 2,
      seed,
      temperature: 0.2 + (i * 0.3), // varied sampling exploration
      isogenicIdentityPercent: 100,
      snapshotBaseline: snapshotId,
      status: 'exploring_branch'
    });
  }

  cluster.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'metadata_recorded',
    transport: 'isogenic_cleavage_plane',
    cluster_id: clusterId,
    clone_count: cluster.clones.length,
    lineage_id: cluster.lineageId,
    clones: cluster.clones,
    isogenic_guarantee: 'metadata hash only; biological/runtime identity is not verified',
    execution_scope: 'metadata_simulation',
    runtime_agents_created: false,
    output: `Recorded ${cluster.clones.length} clone descriptors from snapshot '${snapshotId}'. No runtime agents or biological clones were created.`
  };
  }

function MonozygoticSplitSynchronizeCleavageState({ args, action, clusterId, parentGenomeId, snapshotId, requestedCloneCount, cloneCount, explorationSeeds, cluster, cliOutput, cliFailed, cliErrorText }) {
  const trajectories = args.trajectories || [];
  cluster.divergenceMetrics = {
    evaluatedBranches: trajectories.length || cluster.clones.length,
    consensusBaseline: cluster.snapshotId,
    stateDivergenceScore: 0.18, // slight stochastic variance
    isogenicLineageStable: true
  };
  cluster.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'cleavage_synchronized',
    transport: 'isogenic_cleavage_plane',
    cluster_id: clusterId,
    divergence_metrics: cluster.divergenceMetrics,
    execution_scope: 'metadata_simulation',
    trajectories_evaluated: trajectories.length,
    output: `Recorded metadata for ${trajectories.length} trajectories in cluster '${clusterId}'; no branches were synchronized or evaluated.`
  };
  }

function monozygoticSplitOptions(args) {
  const action = args.action || 'status';
  const clusterId = args.cluster_id || `monozygote-cluster-${Date.now()}`;
  const parentGenomeId = args.parent_genome_id || 'gen-zygote-root';
  const snapshotId = args.snapshot_id || 'snp-cleavage-origin';
  const requestedCloneCount = args.clone_count === undefined ? 2 : Number(args.clone_count);
  if (invalidCloneCount(requestedCloneCount)) {
    return { configured: true, success: false, status: 'invalid_args', error: 'clone_count must be a safe integer from 2 to 128.' };
  }
  const cloneCount = requestedCloneCount;
  const explorationSeeds = args.seeds === undefined ? [42, 1337] : args.seeds;
  if (invalidExplorationSeeds(explorationSeeds)) {
    return { configured: true, success: false, status: 'invalid_args', error: 'seeds must be an array of at most 128 safe integers.' };
  }
  return { action, clusterId, parentGenomeId, snapshotId, requestedCloneCount, cloneCount, explorationSeeds };
}

function invalidCloneCount(count) {
  return !Number.isSafeInteger(count) || count < 2 || count > 128;
}

function invalidExplorationSeeds(seeds) {
  return !Array.isArray(seeds) || seeds.length > 128 || !seeds.every(Number.isSafeInteger);
}
