'use strict';

/**
 * Contingency Service — Meillassoux, Badiou.
 *
 * Mapping GenOS :
 *  - Meillassoux  = contingence absolue (tout pourrait être autrement)
 *  - Badiou      = événement comme rupture (telemetry_events)
 *  - Maths de l'être = agents comme ensembles
 */

function absoluteContingency({ agentId, necessary = [], contingent = [] }) {
  if (!agentId) throw new Error('contingencyService.absoluteContingency requires agentId');
  return {
    agentId,
    necessary,
    contingent,
    hyperchaos: true,
    timestamp: Date.now(),
  };
}

function badiouEvent({ agentId, eventType, rupture = false }) {
  if (!agentId || !eventType) {
    throw new Error('contingencyService.badiouEvent requires agentId and eventType');
  }
  const isRupture = ['AGENT_CREATED', 'AGENT_COMPLETED', 'AGENT_FAILED', 'TRINITY_LAUNCHED'].includes(eventType);
  return {
    agentId,
    eventType,
    rupture: rupture || isRupture,
    truth: isRupture ? 'execute_proof' : null,
    fidelity: false,
    timestamp: Date.now(),
  };
}

function mathematicsOfBeing({ agents }) {
  if (!Array.isArray(agents)) {
    throw new Error('contingencyService.mathematicsOfBeing requires an array of agents');
  }
  const ids = agents.map(a => a.id);
  const uniqueIds = [...new Set(ids)];
  return {
    union: uniqueIds,
    intersection: agents.filter(a => a.status === 'running').map(a => a.id),
    powerSet: uniqueIds.length <= 20 ? generatePowerSet(uniqueIds) : [],
  };
}

function generatePowerSet(items) {
  const result = [];
  const total = 1 << items.length;
  for (let i = 0; i < total; i++) {
    const subset = [];
    for (let j = 0; j < items.length; j++) {
      if ((i >> j) & 1) subset.push(items[j]);
    }
    result.push(subset);
  }
  return result;
}

module.exports = {
  absoluteContingency,
  badiouEvent,
  mathematicsOfBeing,
};
