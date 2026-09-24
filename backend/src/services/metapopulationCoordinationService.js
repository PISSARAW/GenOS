'use strict';

/**
 * @file metapopulationCoordinationService.js
 * @description Metapopulation coordination: semi-independent populations that
 * sense a quorum, adapt their connections and regenerate lost roles. Wires the
 * declared mechanisms (quorum_sensing, synaptic_plasticity, regeneration) to
 * concrete, testable functions.
 */
const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');

const DEFAULT_ORGANIZATION = 'quorum_with_abstention';
const DEFAULT_QUORUM_RATIO = 0.5;

function composeMetapopulation(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Metapopulation mission is required.'), { code: 'METAPOPULATION_MISSION_REQUIRED' });
  }
  const members = biologicalModeService.compose('metapopulation', goal);
  const organization = options.organization || DEFAULT_ORGANIZATION;
  return {
    mode: 'metapopulation',
    mission: goal,
    organization,
    mechanisms: members[0]?.mechanisms || [],
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'metapopulation', organization }),
    members
  };
}

function senseQuorum(members, options = {}) {
  const list = Array.isArray(members) ? members : [];
  const threshold = Number.isFinite(options.evidenceThreshold) ? options.evidenceThreshold : 0.5;
  const quorumRatio = Number.isFinite(options.quorumRatio) ? options.quorumRatio : DEFAULT_QUORUM_RATIO;
  let totalWeight = 0;
  let supportWeight = 0;
  for (const member of list) {
    const weight = Number.isFinite(member?.weight) && member.weight > 0 ? member.weight : 1;
    totalWeight += weight;
    const score = Number(member?.evidenceScore);
    if (Number.isFinite(score) && score >= threshold) supportWeight += weight;
  }
  const support = totalWeight > 0 ? Number((supportWeight / totalWeight).toFixed(3)) : 0;
  return { reached: support >= quorumRatio, support, quorumRatio, threshold, responders: list.length };
}

function regenerationPlan(lostRoles, options = {}) {
  const roles = Array.isArray(lostRoles) ? lostRoles.filter(Boolean) : [];
  const maxRespawn = Number.isFinite(options.maxRespawn) ? Math.max(0, options.maxRespawn) : roles.length;
  return {
    respawn: roles.slice(0, maxRespawn),
    skipped: roles.slice(maxRespawn),
    sources: ['lineage', 'episodic_memory', 'cryptobiosis'],
    degraded: roles.length > maxRespawn
  };
}

function connectionWeights(connections, outcomes = {}) {
  const list = Array.isArray(connections) ? connections : [];
  return list.map((connection) => {
    const key = connection?.id || connection?.target;
    const outcome = Number.isFinite(outcomes[key]) ? outcomes[key] : (Number.isFinite(connection?.outcome) ? connection.outcome : 0);
    const weight = Math.max(0, Math.min(1, Number(connection?.weight ?? 0.5) + outcome * 0.1));
    return { ...connection, weight: Number(weight.toFixed(3)) };
  });
}

module.exports = { composeMetapopulation, senseQuorum, regenerationPlan, connectionWeights };
