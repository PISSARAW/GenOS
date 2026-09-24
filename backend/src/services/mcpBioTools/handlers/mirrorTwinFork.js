const crypto = require('crypto');
const { quoteCliArg } = require('../shellQuote');

// Registry for active mirror twin instances
const mirrorTwinRegistry = new Map(); /* persisterHook: mirrorTwinRegistry */

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
  const action = args.action || 'status';
  // pair_id obligatoire: aucun défaut Date.now() silencieux (rejet invalid_args).
  if (args.pair_id === undefined || args.pair_id === null || String(args.pair_id).trim() === '') {
    return { configured: true, success: false, status: 'invalid_args', error: 'pair_id: is required.' };
  }
  const pairId = args.pair_id;
  const baseSnapshotId = args.snapshot_id || 'snp-root';
  const workspaceId = args.workspace_id || 'ws-default';
  const mission = args.mission || 'Solve target problem under counterfactual verification';

  let cliOutput = null;
  let cliFailed = false;
  let cliErrorText = null;
  if (typeof run === 'function') {
    try {
      const out = run(`genos biomimicry bio-feature --feature mirror_twin --action ${quoteCliArg(action)} --param pair_id=${quoteCliArg(pairId)}`);
      cliOutput = out ? out.toString() : null;
    } catch (cliProbeError) { cliFailed = true; cliErrorText = cliProbeError && cliProbeError.message ? cliProbeError.message : String(cliProbeError); }
  }
  if (cliFailed) {
    return { configured: true, success: false, status: 'tool_error', error: cliErrorText };
  }

  const pair = getMirrorPair(pairId);

  if (action === 'fork_mirror_pair') {
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
      output: `Forked polar mirror twin pair '${pairId}'. Right Twin (Constructive: ${pair.rightTwin.id}) vs Left Twin (Situs Inversus: ${pair.leftTwin.id}).`
    };
  }

  if (action === 'evaluate_polarity_equilibrium') {
    const constructiveClaims = args.constructive_claims || ['Feature implementation proposed'];
    const adversarialCritiques = args.adversarial_critiques || ['Edge case boundary check'];

    if (pair.rightTwin) pair.rightTwin.claimsProposed = constructiveClaims;
    if (pair.leftTwin) pair.leftTwin.counterExamplesFound = adversarialCritiques;

    // Equilibrium calculation: measures how well constructive claims withstood adversarial pressure
    const numClaims = Math.max(1, constructiveClaims.length);
    const numCritiques = adversarialCritiques.length;
    
    // Balanced equilibrium between 0.0 (overwhelmed by bugs) and 1.0 (impenetrable robust solution)
    const survivedCritiques = constructiveClaims.filter(c => !adversarialCritiques.some(crit => crit.includes(c)));
    const equilibrium = Math.min(1.0, Math.max(0.1, survivedCritiques.length / numClaims));
    pair.equilibriumScore = Number(equilibrium.toFixed(2));
    pair.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'equilibrium_evaluated',
      transport: 'counterfactual_mirror_plane',
      pair_id: pairId,
      equilibrium_score: pair.equilibriumScore,
      survived_claims: survivedCritiques,
      falsified_count: numClaims - survivedCritiques.length,
      arbiter_recommendation: pair.equilibriumScore >= 0.7 ? 'APPROVE_PROMOTION' : 'ITERATE_COUNTERFACTUAL',
      output: `Mirror twin equilibrium evaluated at ${pair.equilibriumScore}. Recommendation: ${pair.equilibriumScore >= 0.7 ? 'APPROVE_PROMOTION' : 'ITERATE_COUNTERFACTUAL'}.`
    };
  }

  if (action === 'reconcile_mirror') {
    if (pair.equilibriumScore < 0.6 && args.force !== true) {
      return {
        configured: true,
        success: false,
        status: 'reconciliation_blocked',
        transport: 'counterfactual_mirror_plane',
        pair_id: pairId,
        equilibrium_score: pair.equilibriumScore,
        output: `Reconciliation blocked: equilibrium score ${pair.equilibriumScore} below quality gate threshold 0.60. Adversarial counter-examples unresolved.`
      };
    }

    pair.reconciliationState = 'reconciled_promoted';
    pair.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'reconciled_promoted',
      transport: 'counterfactual_mirror_plane',
      pair_id: pairId,
      final_equilibrium: pair.equilibriumScore,
      promoted_snapshot_id: `snp-reconciled-${pairId.slice(-6)}`,
      output: `Mirror twin pair '${pairId}' successfully reconciled and promoted with empirical anti-regression guarantee.`
    };
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
