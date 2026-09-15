const adaptivePersister = require('../../adaptiveStateBootstrap');
// Registry for Dynamic Triplet Expansion & Anticipation
const dynamicExpansionRegistry = new Map();

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
    transport: 'dynamic_expansion_engine',
    expansion_id: expId,
    generation: record.generation,
    repeat_motif: record.motif,
    repeat_count: record.repeatCount,
    is_pathological: record.isPathological,
    severity: record.severity,
    output: `Generation ${record.generation}: motif '${record.motif}' expanded to ${record.repeatCount} repeats (${record.severity}).`
  };
}

function handleEvaluateAnticipation(record, expId) {
  const isHighRisk = record.repeatCount >= PATHOLOGICAL_THRESHOLD;
  const circuitBreakerAdvised = record.repeatCount >= SEVERE_THRESHOLD;

  return {
    configured: true,
    success: true,
    status: 'anticipation_evaluated',
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
    return handleReplicateGeneration(record, expId, args.delta_repeats);
  }
  if (action === 'evaluate_anticipation_risk') {
    return handleEvaluateAnticipation(record, expId);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
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
  if (_dynamicTripletExpansionRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::dynamic_triplet_expansion', 'dynamicTripletExpansionRegistry') : null;
    const mapToUse = stored && stored.size ? stored : dynamicTripletExpansionRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::dynamic_triplet_expansion', 'dynamicTripletExpansionRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'dynamicTripletExpansionRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _dynamicTripletExpansionRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensuredynamicTripletExpansionRegistryPersistent();
}

function getAdaptivePersister() {
  return adaptivePersister;
}

function getSnapshot() {
  const map = module.exports.dynamicTripletExpansionRegistry || dynamicTripletExpansionRegistry;
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
