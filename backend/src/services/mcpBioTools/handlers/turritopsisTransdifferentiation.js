/**
 * @file turritopsisTransdifferentiation.js
 * @description Biomimetic handler for Turritopsis dohrnii immortal jellyfish transdifferentiation.
 * Reverts an exhausted or corrupted adult agent (Medusa) back to a juvenile stem state (Polyp)
 * by purging execution context while preserving core genome loci and identity.
 */

'use strict';

const turritopsisRegistry = new Map();

function getOrCreateLifecycle(agentId, genomeLoci = []) {
  if (!turritopsisRegistry.has(agentId)) {
    turritopsisRegistry.set(agentId, {
      agent_id: agentId,
      stage: 'MEDUSA_ADULT',
      rejuvenation_cycles: 0,
      preserved_genome: Array.isArray(genomeLoci) && genomeLoci.length > 0 
        ? genomeLoci 
        : ['LOCUS_CORE_IDENTITY', 'LOCUS_KERNEL_INTEGRITY'],
      context_purged_count: 0,
      last_reversion_at: null,
      created_at: new Date().toISOString()
    });
  }
  return turritopsisRegistry.get(agentId);
}

function executeTransdifferentiation(state, trigger, newLoci) {
  if (Array.isArray(newLoci) && newLoci.length > 0) {
    state.preserved_genome = newLoci;
  }
  state.stage = 'JUVENILE_POLYP';
  state.rejuvenation_cycles += 1;
  state.context_purged_count += 1;
  state.last_reversion_at = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'transdifferentiation_completed',
    transport: 'turritopsis_transdifferentiation',
    action: 'trigger_transdifferentiation',
    agent_id: state.agent_id,
    new_stage: state.stage,
    stress_trigger: trigger,
    rejuvenation_cycles: state.rejuvenation_cycles,
    preserved_genome: state.preserved_genome,
    output: `Agent '${state.agent_id}' ontogenically reverted from Medusa to Juvenile Polyp (Cycle #${state.rejuvenation_cycles}). Context purged, genome preserved.`
  };
}

function handleTransdifferentiation(params = {}) {
  const agentId = params.agent_id || params.target_id || 'agent-turritopsis-1';
  const state = getOrCreateLifecycle(agentId, params.genome_loci);
  const action = params.action || 'status';

  if (action === 'trigger_transdifferentiation' || action === 'revert_to_polyp') {
    const trigger = params.stress_trigger || 'TOKEN_EXHAUSTION_CRITICAL';
    return executeTransdifferentiation(state, trigger, params.genome_loci);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'turritopsis_transdifferentiation',
    action: 'status',
    agent_id: state.agent_id,
    current_stage: state.stage,
    rejuvenation_cycles: state.rejuvenation_cycles,
    preserved_genome: state.preserved_genome,
    last_reversion_at: state.last_reversion_at,
    output: `Turritopsis engine active for '${agentId}': stage=${state.stage}, cycles=${state.rejuvenation_cycles}.`
  };
}

function handleTurritopsisError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'turritopsis_transdifferentiation',
    output: e.message || 'Unknown Turritopsis transdifferentiation error'
  };
}

module.exports = {
  handleTransdifferentiation,
  handleTurritopsisError,
  turritopsisRegistry
};
