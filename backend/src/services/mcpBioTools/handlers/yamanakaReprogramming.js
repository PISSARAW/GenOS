const adaptivePersister = require('../../adaptiveStateBootstrap');
/**
 * @file yamanakaReprogramming.js
 * @description Biomimetic handler for Yamanaka Factors (OSKM) Epigenetic Reprogramming.
 * Clears specialized role biases and epigenetic marks from differentiated agents,
 * restoring induced pluripotency (iPSC) for dynamic re-specialization across any collective niche.
 */

'use strict';

const yamanakaRegistry = new Map(); /* persisterHook: yamanakaRegistry */

function getOrCreateStemProfile(agentId, initialRole = 'SPECIALIZED_WORKER') {
  if (!yamanakaRegistry.has(agentId)) {
    yamanakaRegistry.set(agentId, {
      agent_id: agentId,
      current_state: 'DIFFERENTIATED_SOMATIC',
      active_role: initialRole,
      pluripotency_score: 0.1,
      oskm_factors: { oct4: false, sox2: false, klf4: false, c_myc: false },
      epigenetic_memory_cleared: false,
      reprogramming_history: [],
      updated_at: new Date().toISOString()
    });
  }
  return yamanakaRegistry.get(agentId);
}

function inducePluripotency(record, factors = {}) {
  record.oskm_factors = {
    oct4: factors.oct4 !== false,
    sox2: factors.sox2 !== false,
    klf4: factors.klf4 !== false,
    c_myc: factors.c_myc !== false
  };
  record.current_state = 'INDUCED_PLURIPOTENT_STEM_AGENT';
  record.active_role = 'PLURIPOTENT_STEM_AGENT';
  record.pluripotency_score = 1.0;
  record.epigenetic_memory_cleared = true;
  record.updated_at = new Date().toISOString();

  const entry = {
    action: 'induce_pluripotency',
    factors: record.oskm_factors,
    timestamp: record.updated_at
  };
  record.reprogramming_history.push(entry);

  return {
    configured: true,
    success: true,
    status: 'pluripotency_induced',
    transport: 'yamanaka_reprogramming_engine',
    action: 'induce_pluripotency',
    agent_id: record.agent_id,
    current_state: record.current_state,
    pluripotency_score: record.pluripotency_score,
    oskm_cocktail: record.oskm_factors,
    epigenetic_memory_cleared: true,
    output: `Agent '${record.agent_id}' successfully reprogrammed to iPSC state via OSKM factors. Pluripotency restored to 1.0.`
  };
}

function differentiateNiche(record, targetRole, nicheParams = {}) {
  const role = targetRole || 'SECURITY_AUDITOR_SPECIALIST';
  record.current_state = 'DIFFERENTIATED_SPECIALIZED';
  record.active_role = role;
  record.pluripotency_score = 0.2;
  record.updated_at = new Date().toISOString();

  const entry = {
    action: 'differentiate_into_niche',
    target_role: role,
    niche_params: nicheParams,
    timestamp: record.updated_at
  };
  record.reprogramming_history.push(entry);

  return {
    configured: true,
    success: true,
    status: 'differentiation_completed',
    transport: 'yamanaka_reprogramming_engine',
    action: 'differentiate_into_niche',
    agent_id: record.agent_id,
    current_state: record.current_state,
    active_role: record.active_role,
    pluripotency_score: record.pluripotency_score,
    output: `Pluripotent agent '${record.agent_id}' differentiated into specialized niche role '${role}'.`
  };
}

function handleYamanakaReprogramming(params = {}) {
  const agentId = params.agent_id || params.target_id || 'agent-yamanaka-1';
  const record = getOrCreateStemProfile(agentId, params.initial_role);
  const action = params.action || 'status';

  if (action === 'induce_pluripotency' || action === 'reprogram_ipsc') {
    return inducePluripotency(record, params.factors);
  }
  if (action === 'differentiate_into_niche' || action === 'specialize') {
    return differentiateNiche(record, params.target_role, params.niche_params);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'yamanaka_reprogramming_engine',
    action: 'status',
    agent_id: record.agent_id,
    current_state: record.current_state,
    active_role: record.active_role,
    pluripotency_score: record.pluripotency_score,
    oskm_factors: record.oskm_factors,
    reprogrammings_count: record.reprogramming_history.length,
    output: `Yamanaka reprogramming engine active for '${agentId}': state=${record.current_state}, role=${record.active_role}.`
  };
}

function handleYamanakaError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'yamanaka_reprogramming_engine',
    output: e.message || 'Unknown Yamanaka reprogramming error'
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _yamanakaRegistryPersistent = false;

function _ensureyamanakaRegistryPersistent() {
  if (_yamanakaRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::yamanaka_reprogramming', 'yamanakaRegistry') : null;
    const mapToUse = stored && stored.size ? stored : yamanakaRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::yamanaka_reprogramming', 'yamanakaRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, 'yamanakaRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _yamanakaRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensureyamanakaRegistryPersistent();
}

function getAdaptivePersister() {
  return adaptivePersister;
}

function getSnapshot() {
  const map = module.exports.yamanakaRegistry || yamanakaRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensureyamanakaRegistryPersistent();

module.exports = {
  handleYamanakaReprogramming,
  handleYamanakaError,
  yamanakaRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
