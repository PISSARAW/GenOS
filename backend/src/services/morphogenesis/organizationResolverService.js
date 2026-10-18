'use strict';

const { ORGANIZATION_CAPABILITIES } = require('../topologyCapabilityService');

const ORGANIZATION_IDS = Object.freeze(Object.keys(ORGANIZATION_CAPABILITIES)
  .filter((id) => id !== 'cross_functional_pod'));

const PROFILES = Object.freeze({
  specialist_expert_committee: profile({ deterministic: 1, evidence: 0.8 }, ['a_team', 'holobionte']),
  blind_adversarial_review: profile({ adversarial: 0.9, contradiction: 0.8, uncertainty: 0.5 }, ['trinity', 'biocenose'], ['security']),
  red_blue_coevolution: profile({ adversarial: 1, risk: 0.8 }, ['biocenose'], ['security']),
  brier_weighted_consensus: profile({ consensus: 0.9, uncertainty: 0.7, evidence: 0.6 }, ['trinity', 'biocenose']),
  quorum_with_abstention: profile({ consensus: 1, uncertainty: 0.4 }, ['biocenose', 'metapopulation']),
  stigmergy: profile({ distributed: 0.9, exploration: 0.6 }, ['biome', 'rhizome']),
  flocking_boids: profile({ coordination: 1, distributed: 0.7 }, ['biome', 'rhizome']),
  fish_school_search: profile({ exploration: 1, stagnation: 0.7 }, ['biome', 'rhizome']),
  slime_mould_network: profile({ adaptation: 1, distributed: 0.8, redundancy: 0.4 }, ['biome', 'rhizome']),
  grey_wolf_optimizer: profile({ optimization: 1, deterministic: 0.6 }, ['a_team', 'metapopulation']),
  mycelial_routing: profile({ capabilityDiversity: 1, distributed: 0.8 }, ['rhizome', 'holobionte']),
  dynamic_polyethism: profile({ adaptation: 1, capabilityDiversity: 0.8 }, ['metapopulation', 'biome']),
  energy_huddle: profile({ budgetPressure: 1, coordination: 0.4 }, ['biome', 'metapopulation']),
  network_silence: profile({ redundancy: 1, budgetPressure: 0.5 }, ['syncytium', 'biome']),
  strategy_arena: profile({ exploration: 0.9, uncertainty: 0.8 }, ['trinity', 'rhizome']),
  hierarchical_merge: profile({ convergence: 1, evidence: 0.7 }, ['a_team', 'syncytium']),
  competitive_arena: profile({ contradiction: 1, exploration: 0.7 }, ['trinity', 'biocenose']),
  isolated_recovery: profile({ recovery: 1, risk: 0.7 }, ['holobionte', 'metapopulation']),
  memory_compilation: profile({ memoryPressure: 1, evidence: 0.5 }, ['syncytium', 'holobionte'])
});

function profile(signals, topologies, domains = []) {
  return { signals, topologies, domains };
}

function unit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function firstNumber(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined) return unit(source[key]);
  }
  return 0;
}

function normalizeSignals(context = {}) {
  const profileInput = context.problemProfile || {};
  const diagnosis = context.diagnosis || {};
  const domain = String(profileInput.domain || context.domain || '').toLowerCase();
  const failure = firstNumber(profileInput, ['failure_rate', 'failureRate', 'failures']);
  const security = domain === 'security' ? 0.8 : 0;
  return {
    uncertainty: Math.max(firstNumber(profileInput, ['uncertainty']), firstNumber(diagnosis, ['uncertainty'])),
    adversarial: Math.max(security, firstNumber(profileInput, ['adversarial_risk', 'adversarialRisk']), firstNumber(diagnosis, ['adversarialRisk'])),
    contradiction: Math.max(firstNumber(profileInput, ['contradiction']), firstNumber(diagnosis, ['contradiction'])),
    risk: Math.max(failure, firstNumber(profileInput, ['risk', 'provenance_risk']), firstNumber(diagnosis, ['provenanceRisk'])),
    deterministic: firstNumber(profileInput, ['deterministic_need', 'deterministicNeed']),
    consensus: firstNumber(profileInput, ['consensus_need', 'consensusNeed']),
    evidence: firstNumber(profileInput, ['evidence_need', 'evidenceNeed', 'provenance_risk']),
    distributed: firstNumber(profileInput, ['distributed_need', 'distributedNeed']),
    exploration: firstNumber(profileInput, ['exploration_need', 'explorationNeed']),
    stagnation: Math.max(firstNumber(profileInput, ['stagnation']), firstNumber(diagnosis, ['stagnation'])),
    adaptation: firstNumber(profileInput, ['adaptation_need', 'adaptationNeed']),
    optimization: firstNumber(profileInput, ['optimization_need', 'optimizationNeed']),
    capabilityDiversity: firstNumber(profileInput, ['capability_diversity', 'capabilityDiversity']),
    budgetPressure: firstNumber(profileInput, ['budget_pressure', 'budgetPressure']),
    redundancy: firstNumber(profileInput, ['communication_redundancy', 'communicationRedundancy']),
    coordination: firstNumber(profileInput, ['coordination_need', 'coordinationNeed']),
    convergence: firstNumber(profileInput, ['convergence_need', 'convergenceNeed']),
    recovery: Math.max(failure, firstNumber(profileInput, ['recovery_need', 'recoveryNeed'])),
    memoryPressure: firstNumber(profileInput, ['memory_pressure', 'memoryPressure'])
  };
}

function signalFit(organization, signals) {
  const entries = Object.entries(PROFILES[organization].signals);
  const total = entries.reduce((sum, entry) => sum + entry[1], 0) || 1;
  return entries.reduce((sum, entry) => sum + unit(signals[entry[0]]) * entry[1], 0) / total;
}

function capabilityFit(organization, available) {
  const required = ORGANIZATION_CAPABILITIES[organization] || [];
  if (!Array.isArray(available)) return { score: 0.5, missing: [] };
  const provided = new Set(available.map((item) => String(item).toUpperCase()));
  const missing = required.filter((item) => !provided.has(String(item).toUpperCase()));
  return { score: required.length ? (required.length - missing.length) / required.length : 1, missing };
}

function topologyFit(organization, topology) {
  if (!topology) return 0.5;
  return PROFILES[organization].topologies.includes(topology) ? 1 : 0.25;
}

function domainFit(organization, domain) {
  const domains = PROFILES[organization].domains;
  if (!domains.length || !domain) return 0.5;
  return domains.includes(String(domain).toLowerCase()) ? 1 : 0;
}

function currentOrganization(context) {
  return context.currentOrganization || context.currentState?.organization
    || context.currentState?.topologyState?.organization || null;
}

function scoreOrganization(organization, context = {}) {
  if (!PROFILES[organization]) return null;
  const signals = normalizeSignals(context);
  const capabilities = capabilityFit(organization, context.availableCapabilities);
  const continuity = currentOrganization(context) === organization ? 1 : 0;
  const defaultBias = organization === 'specialist_expert_committee' ? 1 : 0;
  const factors = {
    signalFit: signalFit(organization, signals),
    capabilityFit: capabilities.score,
    topologyFit: topologyFit(organization, context.selectedTopology),
    domainFit: domainFit(organization, context.problemProfile?.domain || context.domain),
    continuity,
    defaultBias
  };
  const score = factors.signalFit * 0.52 + factors.capabilityFit * 0.18
    + factors.topologyFit * 0.13 + factors.domainFit * 0.08
    + factors.continuity * 0.06 + factors.defaultBias * 0.03;
  return {
    organization, score: Number(score.toFixed(4)), factors,
    requiredCapabilities: [...(ORGANIZATION_CAPABILITIES[organization] || [])],
    missingCapabilities: capabilities.missing,
    reasons: reasonsFor(organization, factors),
    risks: capabilities.missing.length ? [`missing_capabilities:${capabilities.missing.join(',')}`] : []
  };
}

function reasonsFor(organization, factors) {
  const reasons = [];
  if (factors.signalFit >= 0.5) reasons.push('mission_signal_fit');
  if (factors.capabilityFit >= 0.75) reasons.push('capability_fit');
  if (factors.topologyFit === 1) reasons.push('topology_affinity');
  if (factors.domainFit === 1 && PROFILES[organization].domains.length) reasons.push('domain_fit');
  if (factors.continuity === 1) reasons.push('continuity');
  if (!reasons.length) reasons.push('deterministic_fallback');
  return reasons;
}

function compareOrganizations(context = {}) {
  return ORGANIZATION_IDS.map((organization, index) => ({
    ...scoreOrganization(organization, context), canonicalIndex: index
  })).sort((left, right) => right.score - left.score || left.canonicalIndex - right.canonicalIndex)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function resolveOrganization(context = {}) {
  const rankings = compareOrganizations(context);
  const requested = String(context.requestedOrganization || '').trim();
  const explicit = rankings.find((entry) => entry.organization === requested);
  const selected = explicit || rankings[0] || null;
  return selected ? {
    organization: selected.organization,
    score: selected.score,
    selectedBy: explicit ? 'explicit' : 'ranked',
    reasons: selected.reasons,
    risks: selected.risks,
    rankings
  } : null;
}

module.exports = {
  ORGANIZATION_IDS,
  PROFILES,
  normalizeSignals,
  scoreOrganization,
  compareOrganizations,
  resolveOrganization
};
