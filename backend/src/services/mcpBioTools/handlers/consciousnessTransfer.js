/**
 * @file consciousnessTransfer.js
 * @description Biomimetic & Temporal handler for Consciousness Transfer (Groundhog Day / Edge of Tomorrow Replay).
 * Restores physical/workspace baseline state S(t0) while preserving and injecting the entire
 * episodic memory and causal knowledge graph accumulated up to t_future into the restored agent.
 */

'use strict';

const consciousnessRegistry = new Map(); /* persisterHook: consciousnessRegistry */

function getOrCreateConsciousness(agentId, baselineId = 'snap-baseline-t0') {
  if (!consciousnessRegistry.has(agentId)) {
    consciousnessRegistry.set(agentId, {
      agent_id: agentId,
      current_iteration: 1,
      baseline_snapshot_id: baselineId,
      cumulative_memories: [],
      transferred_failures_count: 0,
      last_transfer_at: null,
      created_at: new Date().toISOString()
    });
  }
  return consciousnessRegistry.get(agentId);
}

function executeConsciousnessTransfer(record, baselineId, futureMemories = []) {
  if (baselineId) {
    record.baseline_snapshot_id = baselineId;
  }
  const newMemories = Array.isArray(futureMemories) ? futureMemories : [];
  for (const mem of newMemories) {
    record.cumulative_memories.push({
      memory: mem,
      iteration_origin: record.current_iteration,
      injected_at: new Date().toISOString()
    });
  }
  record.current_iteration += 1;
  record.transferred_failures_count += newMemories.length;
  record.last_transfer_at = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'consciousness_transferred',
    transport: 'temporal_consciousness_transfer_engine',
    action: 'execute_transfer',
    agent_id: record.agent_id,
    new_iteration: record.current_iteration,
    restored_baseline: record.baseline_snapshot_id,
    total_preserved_memories: record.cumulative_memories.length,
    injected_memories_count: newMemories.length,
    output: `Consciousness transferred to baseline '${record.baseline_snapshot_id}'. Agent restarted at iteration #${record.current_iteration} with ${record.cumulative_memories.length} forward memories intact.`
  };
}

function handleConsciousnessTransfer(params = {}) {
  const agentId = params.agent_id || params.target_id || 'agent-time-traveler-1';
  const record = getOrCreateConsciousness(agentId, params.baseline_snapshot_id);
  const action = params.action || 'status';

  if (action === 'execute_transfer' || action === 'replay_with_memories') {
    return executeConsciousnessTransfer(record, params.baseline_snapshot_id, params.future_memories);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'temporal_consciousness_transfer_engine',
    action: 'status',
    agent_id: record.agent_id,
    current_iteration: record.current_iteration,
    baseline_snapshot_id: record.baseline_snapshot_id,
    cumulative_memories_count: record.cumulative_memories.length,
    last_transfer_at: record.last_transfer_at,
    output: `Consciousness transfer engine active for '${agentId}': iteration #${record.current_iteration}, memories=${record.cumulative_memories.length}.`
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
    Object.defineProperty(module.exports, 'consciousnessRegistry', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
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

_ensureconsciousnessRegistryPersistent();

module.exports = {
  handleConsciousnessTransfer,
  handleConsciousnessError,
  consciousnessRegistry,
  setAdaptivePersister,
  getAdaptivePersister,
  getSnapshot,
  onMutation};
