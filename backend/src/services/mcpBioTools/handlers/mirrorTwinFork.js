const { probeBioFeature } = require('../featureProbe');
const crypto = require('crypto');
const { quoteCliArg } = require('../shellQuote');

// Registry for active mirror twin instances
let mirrorTwinRegistry = new Map(); /* persisterHook: mirrorTwinRegistry */

function getMirrorPair(pairId) {
  if (!mirrorTwinRegistry.has(pairId)) {
    mirrorTwinRegistry.set(pairId, {
      pairId,
      baseSnapshotId: null,
      workspaceId: null,
      rightTwin: null, // Constructive / Optimist
      leftTwin: null,  // Skeptic / Adversarial (Situs Inversus)
      equilibriumScore: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reconciliationState: 'unreconciled'
    });
  }
  return mirrorTwinRegistry.get(pairId);
}

function handleMirrorTwinFork(args = {}, run) {
  const options = mirrorTwinForkOptions(args);
  if (options.status === 'invalid_args') return options;
  const { action, pairId, baseSnapshotId, workspaceId, mission } = options;

  const { cliOutput, cliFailed, cliErrorText } = probeBioFeature(run, `genos biomimicry bio-feature --feature mirror_twin --action ${quoteCliArg(action)} --param pair_id=${quoteCliArg(pairId)}`);
  if (cliFailed) {
    return { configured: true, success: false, status: 'tool_error', error: cliErrorText };
  }

  const pair = getMirrorPair(pairId);

  if (action === 'fork_mirror_pair') {
    return MirrorTwinForkForkMirrorPair({ args, action, pairId, baseSnapshotId, workspaceId, mission, pair, cliOutput, cliFailed, cliErrorText });
  }

  if (action === 'evaluate_polarity_equilibrium') {
    return MirrorTwinForkEvaluatePolarityEquilibrium({ args, action, pairId, baseSnapshotId, workspaceId, mission, pair, cliOutput, cliFailed, cliErrorText });
  }

  if (action === 'reconcile_mirror') {
    return MirrorTwinForkReconcileMirror({ args, action, pairId, baseSnapshotId, workspaceId, mission, pair, cliOutput, cliFailed, cliErrorText });
  }

  // Default: status
  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'counterfactual_mirror_plane',
    pair_id: pairId,
    pair_state: pair,
    output: `Mirror twin pair '${pairId}' status: ${pair.reconciliationState} (Equilibrium: ${pair.equilibriumScore}).`
  };
}

function handleMirrorTwinForkError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'counterfactual_mirror_plane',
    output: e.stdout ? e.stdout.toString() : e.message
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _mirrorTwinRegistryPersistent = false;

function _ensuremirrorTwinRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_mirrorTwinRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::mirror_twin_fork', 'mirrorTwinRegistry') : null;
    const mapToUse = stored && stored.size ? stored : mirrorTwinRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::mirror_twin_fork', 'mirrorTwinRegistry', mapToUse) : mapToUse;
    mirrorTwinRegistry = persistentMap;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'mirrorTwinRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _mirrorTwinRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensuremirrorTwinRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.mirrorTwinRegistry || mirrorTwinRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensuremirrorTwinRegistryPersistent();

module.exports = {
  handleMirrorTwinFork,
  handleMirrorTwinForkError,
  mirrorTwinRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};

function MirrorTwinForkForkMirrorPair({ args, action, pairId, baseSnapshotId, workspaceId, mission, pair, cliOutput, cliFailed, cliErrorText }) {
  pair.baseSnapshotId = baseSnapshotId;
  pair.workspaceId = workspaceId;

  const hashSeed = crypto.createHash('sha256').update(pairId + baseSnapshotId).digest('hex');

  // Right-Hand Twin: Constructive, builds features, expands solutions
  pair.rightTwin = {
    id: `twin-right-${hashSeed.slice(0, 6)}`,
    polarity: 'constructive_optimist',
    objective: `[Constructive] Deliver implementation satisfying mission: ${mission}`,
    invariants: ['code_compiles', 'features_implemented', 'positive_path_verified'],
    heuristics: { exploration_bias: 0.8, skepticism_weight: 0.2 },
    claimsProposed: []
  };

  // Left-Hand Twin (Situs Inversus): Inverted polar objective, actively falsifies
  pair.leftTwin = {
    id: `twin-left-${hashSeed.slice(6, 12)}`,
    polarity: 'adversarial_skeptic_situs_inversus',
    objective: `[Situs Inversus] Find edge case failures and break claims for mission: ${mission}`,
    invariants: ['boundary_fault_injection', 'regression_hunt', 'falsification_sought'],
    heuristics: { exploration_bias: 0.2, skepticism_weight: 0.9 },
    counterExamplesFound: []
  };

  pair.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'mirror_pair_forked',
    transport: 'counterfactual_mirror_plane',
    pair_id: pairId,
    base_snapshot_id: baseSnapshotId,
    right_twin: pair.rightTwin,
    left_twin: pair.leftTwin,
    execution_scope: 'metadata_simulation',
    runtime_agents_created: false,
    output: `Recorded metadata descriptors for mirror pair '${pairId}'. No runtime agents were forked.`
  };
  }

function MirrorTwinForkEvaluatePolarityEquilibrium({ args, action, pairId, baseSnapshotId, workspaceId, mission, pair, cliOutput, cliFailed, cliErrorText }) {
  const constructiveClaims = args.constructive_claims === undefined ? [] : args.constructive_claims;
  const adversarialCritiques = args.adversarial_critiques === undefined ? [] : args.adversarial_critiques;
  if (!Array.isArray(constructiveClaims) || !constructiveClaims.every(value => typeof value === 'string') ||
      !Array.isArray(adversarialCritiques) || !adversarialCritiques.every(value => typeof value === 'string')) {
    return { configured: true, success: false, status: 'invalid_args', error: 'constructive_claims and adversarial_critiques must be arrays of strings.' };
  }

  if (pair.rightTwin) pair.rightTwin.claimsProposed = constructiveClaims;
  if (pair.leftTwin) pair.leftTwin.counterExamplesFound = adversarialCritiques;

  // Inputs are recorded as metadata only; no claims or counterexamples are executed or checked.
  const numClaims = constructiveClaims.length;
  const survivedCritiques = [];
  pair.equilibriumScore = 0;
  pair.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'metadata_recorded',
    transport: 'counterfactual_mirror_plane',
    pair_id: pairId,
    equilibrium_score: pair.equilibriumScore,
    survived_claims: survivedCritiques,
    falsified_count: 0,
    execution_scope: 'metadata_simulation',
    evidence_reviewed: false,
    promotion_allowed: false,
    arbiter_recommendation: 'MANUAL_REVIEW_REQUIRED',
    output: `Recorded ${numClaims} claims and ${adversarialCritiques.length} critiques as metadata; no empirical evaluation occurred. Manual review is required.`
  };
  }

function MirrorTwinForkReconcileMirror({ args, action, pairId, baseSnapshotId, workspaceId, mission, pair, cliOutput, cliFailed, cliErrorText }) {
  pair.reconciliationState = 'manual_review_required';
  pair.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: false,
    status: 'promotion_unavailable',
    transport: 'counterfactual_mirror_plane',
    pair_id: pairId,
    final_equilibrium: pair.equilibriumScore,
    execution_scope: 'metadata_simulation',
    promotion_allowed: false,
    output: `Pair '${pairId}' is recorded for manual review. No snapshot was promoted and no anti-regression guarantee was established.`
  };
  }

function mirrorTwinForkOptions(args) {
  const action = args.action || 'status';
  // pair_id obligatoire: aucun défaut Date.now() silencieux (rejet invalid_args).
  if (args.pair_id === undefined || args.pair_id === null || String(args.pair_id).trim() === '') {
    return { configured: true, success: false, status: 'invalid_args', error: 'pair_id: is required.' };
  }
  const pairId = args.pair_id;
  const baseSnapshotId = args.snapshot_id || 'snp-root';
  const workspaceId = args.workspace_id || 'ws-default';
  const mission = args.mission || 'Solve target problem under counterfactual verification';
  return { action, pairId, baseSnapshotId, workspaceId, mission };
}
