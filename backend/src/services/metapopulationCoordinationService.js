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
  const counts = { accepted: 0, refused: 0, abstained: 0, absent: 0, nonResponding: 0 };
  for (const member of list) {
    const weight = Number.isFinite(member?.weight) && member.weight > 0 ? member.weight : 1;
    totalWeight += weight;
    const status = member?.status;
    if (status === 'refused') counts.refused += 1;
    else if (status === 'abstained') counts.abstained += 1;
    else if (status === 'absent') counts.absent += 1;
    else if (status === 'non_responding') counts.nonResponding += 1;
    else if (status === 'responded') {
      const score = validatedDossierScore(member.dossier);
      if (score >= threshold) { supportWeight += weight; counts.accepted += 1; }
      else counts.refused += 1;
    } else counts.nonResponding += 1;
  }
  const support = totalWeight > 0 ? Number((supportWeight / totalWeight).toFixed(3)) : 0;
  return { reached: support >= quorumRatio && counts.accepted > 0, support, quorumRatio, threshold, responders: counts.accepted + counts.refused, counts };
}

function validatedDossierScore(dossier) {
  if (dossier?.status !== 'validated' || !Array.isArray(dossier.acceptedEvidence)) return 0;
  const accepted = dossier.acceptedEvidence.filter((item) => item && typeof item === 'object' && item.verified === true);
  return accepted.length ? 1 : 0;
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
    const previous = connection?.weight === undefined ? 0.5 : connection.weight;
    if (!Number.isFinite(previous) || previous < 0 || previous > 1) throw Object.assign(new Error('Connection weight must be finite and between zero and one.'), { code: 'METAPOPULATION_WEIGHT_INVALID' });
    const outcome = Number.isFinite(outcomes[key]) ? outcomes[key] : (Number.isFinite(connection?.outcome) ? connection.outcome : 0);
    const next = Math.max(0, Math.min(1, previous + Math.max(-1, Math.min(1, outcome)) * 0.1));
    const weight = Number(next.toFixed(3));
    return { ...connection, previousWeight: Number(previous.toFixed(3)), weight, changeReason: weight === previous ? 'bounded_no_change' : outcome > 0 ? 'positive_evidence' : 'negative_evidence' };
  });
}

module.exports = { composeMetapopulation, senseQuorum, regenerationPlan, connectionWeights };
