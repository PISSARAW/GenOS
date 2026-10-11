/**
 * @file consciousnessTransfer.js
 * @description Legacy temporal alias: sealed agent-state restore, never consciousness transfer.
 *
 * CLASSIFICATION: agent_state_restore_only
 * Le statut historique reste une simulation. L'exécution ne restaure qu'un
 * snapshot scellé dans la portée MCP de confiance, sans mémoire future.
 */

'use strict';

const consciousnessRegistry = new Map(); /* persisterHook: consciousnessRegistry */
const MAX_REGISTRY_ENTRIES = 1000;
const SUPPORTED_ACTIONS = new Set(['status', 'execute_transfer', 'replay_with_memories', 'restore_snapshot']);

function registryMap() {
  return module.exports.consciousnessRegistry || consciousnessRegistry;
}

function getOrCreateConsciousness(agentId, baselineId = 'snap-baseline-t0') {
  const registry = registryMap();
  if (!registry.has(agentId)) {
    if (registry.size >= MAX_REGISTRY_ENTRIES) throw new Error('Replay simulation registry capacity reached.');
    registry.set(agentId, {
      agent_id: agentId,
      current_iteration: 1,
      baseline_snapshot_id: baselineId,
      cumulative_memories: [],
      transferred_failures_count: 0,
      last_transfer_at: null,
      created_at: new Date().toISOString()
    });
  }
  return registry.get(agentId);
}

function executeConsciousnessTransfer(record, baselineId, futureMemories = []) {
  const requestedMemoriesCount = Array.isArray(futureMemories) ? futureMemories.length : 0;
  return {
    configured: true,
    success: false,
    status: 'not_implemented',
    transport: 'temporal_consciousness_transfer_engine',
    action: 'execute_transfer',
    agent_id: record.agent_id,
    restored_baseline: baselineId || record.baseline_snapshot_id,
    injected_memories_count: 0,
    requested_memories_count: requestedMemoriesCount,
    output: 'Future-memory injection is unsupported; only sealed agent-state restoration is available.'
  };
}

function handleConsciousnessTransfer(params = {}) {
  const action = params.action || 'status';
  if (!SUPPORTED_ACTIONS.has(action)) throw new Error('Unsupported temporal state-restore action.');
  if (action === 'restore_snapshot' || (action === 'execute_transfer' && params.future_memories === undefined)) {
    return require('../../mcpAgentStateRestoreService').restoreAgentSnapshot({
      agent_id: params.agent_id, baseline_snapshot_id: params.baseline_snapshot_id,
      future_memories: params.future_memories,
    });
  }
  return simulatedConsciousnessStatus(params, action);
}

function simulatedConsciousnessStatus(params, action) {
  const agentId = params.agent_id || params.target_id || 'agent-time-traveler-1';
  if (typeof agentId !== 'string' || agentId.length > 128) throw new Error('Replay simulation agent id must be a string of at most 128 characters.');
  const record = getOrCreateConsciousness(agentId, params.baseline_snapshot_id);
  if (action === 'execute_transfer' || action === 'replay_with_memories') {
    return executeConsciousnessTransfer(record, params.baseline_snapshot_id, params.future_memories);
  }

  return {
    configured: true,
    success: true,
    status: 'simulation_only',
    transport: 'temporal_consciousness_transfer_engine',
    action: 'status',
    agent_id: record.agent_id,
    current_iteration: record.current_iteration,
    baseline_snapshot_id: record.baseline_snapshot_id,
    cumulative_memories_count: record.cumulative_memories.length,
    last_transfer_at: record.last_transfer_at,
    output: `Registry simulation for '${agentId}': iteration #${record.current_iteration}, memories=${record.cumulative_memories.length}. No agent state was transferred.`
  };
}

function handleConsciousnessError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'temporal_consciousness_transfer_engine',
    output: e.message || 'Unknown Consciousness Transfer error'
  };
}


// ── Persistance adaptive hors process ──────────────────────────────────────
let _consciousnessRegistryPersistent = false;

function _ensureconsciousnessRegistryPersistent() {
  // require lazy pour éviter circularité
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  if (_consciousnessRegistryPersistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('mcp_bio::consciousness_transfer', 'consciousnessRegistry') : null;
    const mapToUse = stored && stored.size ? stored : consciousnessRegistry;
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('mcp_bio::consciousness_transfer', 'consciousnessRegistry', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    module.exports.consciousnessRegistry = persistentMap;
    _consciousnessRegistryPersistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  const adaptivePersister = require('../../adaptiveStateBootstrap');
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensureconsciousnessRegistryPersistent();
}

function getAdaptivePersister() {
  return require('../../adaptiveStateBootstrap');
}

function getSnapshot() {
  const map = module.exports.consciousnessRegistry || consciousnessRegistry;
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

module.exports = {
  handleConsciousnessTransfer,
  handleConsciousnessError,
  consciousnessRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation
};

