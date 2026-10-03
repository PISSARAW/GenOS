// Registry for Dynamic Triplet Expansion & Anticipation
let dynamicExpansionRegistry = new Map();

const PATHOLOGICAL_THRESHOLD = 40;
const SEVERE_THRESHOLD = 70;

function getExpansionRecord(id) {
  if (!dynamicExpansionRegistry.has(id)) {
    dynamicExpansionRegistry.set(id, {
      id,
      motif: 'CAG',
      repeatCount: 15, // normal baseline
      generation: 1,
      isPathological: false,
      severity: 'NORMAL_BENIGN',
      updatedAt: new Date().toISOString()
    });
  }
  return dynamicExpansionRegistry.get(id);
}

function evaluateSeverity(repeatCount) {
  if (repeatCount >= SEVERE_THRESHOLD) return 'SEVERE_EARLY_ONSET';
  if (repeatCount >= PATHOLOGICAL_THRESHOLD) return 'PATHOLOGICAL_EXPANDED';
  return 'NORMAL_BENIGN';
}

function handleReplicateGeneration(record, expId, deltaRepeats) {
  const delta = deltaRepeats !== undefined ? deltaRepeats : 12; // slippage addition
  record.generation += 1;
  record.repeatCount += delta;
  record.severity = evaluateSeverity(record.repeatCount);
  record.isPathological = (record.repeatCount >= PATHOLOGICAL_THRESHOLD);
  record.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'generation_replicated',
    execution_scope: 'metadata_simulation',
    runtime_effect_applied: false,
    transport: 'dynamic_expansion_engine',
    expansion_id: expId,
    generation: record.generation,
    repeat_motif: record.motif,
    repeat_count: record.repeatCount,
    is_pathological: record.isPathological,
    severity: record.severity,
    output: `Generation ${record.generation}: simulated motif '${record.motif}' count is ${record.repeatCount} (${record.severity}); runtime genetics is unchanged.`
  };
}

function handleEvaluateAnticipation(record, expId) {
  const isHighRisk = record.repeatCount >= PATHOLOGICAL_THRESHOLD;
  const circuitBreakerAdvised = record.repeatCount >= SEVERE_THRESHOLD;

  return {
    configured: true,
    success: true,
    status: 'anticipation_evaluated',
    execution_scope: 'metadata_simulation',
    runtime_effect_applied: false,
    transport: 'dynamic_expansion_engine',
    expansion_id: expId,
    generation: record.generation,
    repeat_count: record.repeatCount,
    is_pathological: record.isPathological,
    severity: record.severity,
    circuit_breaker_advised: circuitBreakerAdvised,
    output: `Anticipation index: Gen ${record.generation}, ${record.repeatCount} repeats. Severity: ${record.severity}. Interruption advised: ${circuitBreakerAdvised}.`
  };
}

function handleDynamicTripletExpansion(args = {}) {
  const action = args.action || 'status';
  const expId = args.id || `dyn-${Date.now()}`;
  const record = getExpansionRecord(expId);

  if (action === 'expand_repeats' || action === 'replicate_generation') {
    const delta = args.delta_repeats === undefined ? 12 : args.delta_repeats;
    if (!Number.isSafeInteger(delta) || delta < 0 || !Number.isSafeInteger(record.repeatCount + delta)) {
      return {
        configured: true,
        success: false,
        status: 'invalid_args',
        expansion_id: expId,
        error: 'delta_repeats must be a non-negative safe integer and keep repeat_count safe.'
      };
    }
    return handleReplicateGeneration(record, expId, delta);
  }
  if (action === 'evaluate_anticipation_risk') {
    return handleEvaluateAnticipation(record, expId);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    execution_scope: 'metadata_simulation',
    runtime_effect_applied: false,
    transport: 'dynamic_expansion_engine',
    expansion_id: expId,
    generation: record.generation,
    repeat_count: record.repeatCount,
    severity: record.severity,
    is_pathological: record.isPathological,
    output: `Dynamic expansion engine '${expId}' active (Gen ${record.generation}, ${record.repeatCount} repeats).`
  };
}

function handleDynamicTripletExpansionError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'dynamic_expansion_engine',
    output: e.message || 'Unknown dynamic expansion error'
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _dynamicTripletExpansionRegistryPersistent = false;

function _ensuredynamicTripletExpansionRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_dynamicTripletExpansionRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::dynamic_triplet_expansion', 'dynamicTripletExpansionRegistry') : null;
    const mapToUse = stored && stored.size ? stored : dynamicExpansionRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::dynamic_triplet_expansion', 'dynamicTripletExpansionRegistry', mapToUse) : mapToUse;
    dynamicExpansionRegistry = persistentMap;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'dynamicExpansionRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _dynamicTripletExpansionRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensuredynamicTripletExpansionRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.dynamicExpansionRegistry || dynamicExpansionRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensuredynamicTripletExpansionRegistryPersistent();

module.exports = {
  handleDynamicTripletExpansion,
  handleDynamicTripletExpansionError,
  dynamicExpansionRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
