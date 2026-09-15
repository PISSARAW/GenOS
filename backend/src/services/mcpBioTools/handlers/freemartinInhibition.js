/**
 * Biomimicry Handler: Freemartin Endocrine Inhibition (Free-martinisme Bovin)
 *
 * Simulates asymmetric hormonal flooding between fraternal twins:
 * completely sterilizes reproductive/forking abilities of the subordinate agent
 * while hyper-specializing it into a zero-overhead brute-force compute worker.
 */

const crypto = require('crypto');
const adaptivePersister = require('../../../adaptiveStateBootstrap');

// In-memory registry of freemartinized subordinate agents
const FREEMARTIN_REGISTRY = new Map();

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

function handleInhibit(args) {
  const dominantId = args.dominant_agent_id || 'lead_orchestrator_alpha';
  const subordinateId = args.subordinate_agent_id || `worker_subordinate_${Math.random().toString(36).substring(2, 7)}`;
  const inhibitionStrength = args.inhibition_strength ?? 0.95;

  const freemartinProfile = {
    subordinateId,
    dominantId,
    inhibitionStrength,
    reproductionBlocked: true,
    canSpawn: false,
    canFork: false,
    computeThroughputBoost: 1.0 + (inhibitionStrength * 0.5), // up to +50% compute efficiency from 0% meta-headroom
    sterilizationTimestamp: new Date().toISOString()
  };

  FREEMARTIN_REGISTRY.set(subordinateId, freemartinProfile);

  return {
    configured: true,
    success: true,
    status: 'freemartin_sterilization_active',
    dominant_agent: dominantId,
    subordinate_agent: subordinateId,
    can_spawn: false,
    can_fork: false,
    compute_boost_factor: freemartinProfile.computeThroughputBoost,
    output: `Subordinate [${subordinateId}] sterilized by [${dominantId}]. Replication disabled, compute throughput boosted by ${Math.round(inhibitionStrength * 50)}%.`
  };
}

function handleVerify(args) {
  const subordinateId = args.subordinate_agent_id;
  const record = FREEMARTIN_REGISTRY.get(subordinateId);

  if (!record) {
    return {
      configured: true,
      success: false,
      status: 'not_found',
      error: `Agent [${subordinateId}] is not registered under freemartin inhibition.`
    };
  }

  return {
    configured: true,
    success: true,
    status: 'freemartin_verified',
    subordinate_id: subordinateId,
    is_sterile: record.reproductionBlocked,
    can_fork: record.canFork,
    compute_boost: record.computeThroughputBoost,
    dominant_governor: record.dominantId,
    output: `Agent [${subordinateId}] is STERILE (can_fork: false, can_spawn: false) with compute boost ${record.computeThroughputBoost}x.`
  };
}

function handleStatus(args) {
  const subordinateId = args.subordinate_agent_id;
  if (subordinateId) {
    return handleVerify(args);
  }

  const allRecords = Array.from(FREEMARTIN_REGISTRY.values()).map(r => ({
    subordinate: r.subordinateId,
    dominant: r.dominantId,
    isSterile: r.reproductionBlocked,
    boost: r.computeThroughputBoost
  }));

  return {
    configured: true,
    success: true,
    total_freemartins: allRecords.length,
    freemartins: allRecords
  };
}

async function handle(args, run) {
  const action = (args && args.action) || 'status';

  switch (action) {
    case 'apply_endocrine_inhibition':
      return handleInhibit(args);
    case 'verify_freemartin_status':
      return handleVerify(args);
    case 'status':
    default:
      return handleStatus(args);
  }
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _freemartinRegistryPersistent = false;

function _ensurefreemartinRegistryPersistent() {
  if (_freemartinRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::freemartin_inhibition', 'freemartinRegistry') : null;
    const mapToUse = stored && stored.size ? stored : freemartinRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::freemartin_inhibition', 'freemartinRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'freemartinRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _freemartinRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensurefreemartinRegistryPersistent();
}

function getAdaptivePersister() {
  return adaptivePersister;
}

function getSnapshot() {
  const map = module.exports.freemartinRegistry || freemartinRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensurefreemartinRegistryPersistent();

module.exports = {
  handle,
  FREEMARTIN_REGISTRY,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
