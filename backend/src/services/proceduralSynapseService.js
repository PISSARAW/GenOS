"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function defaultSynapse(from = "?", to = "?") {
  return {
    id: `${from}::${to}`,
    from,
    to,
    weight: 1.0,
    plasticity: { weight: 1.0, potentiationCount: 0, depressionCount: 0 },
    evidence: { successRate: 0, trialCount: 0, successCount: 0, failureCount: 0 },
    type: "excitatory",
    lifecycle: "active",
    dormantSince: null,
    pruningCandidateSince: null,
    lastActivation: { trajectoryId: null, at: null, episode: null },
    lastUsageEpisode: null,
  };
}

function ensurePlasticity(s) {
  if (typeof s.plasticity !== "object" || s.plasticity === null) {
    s.plasticity = { weight: s.weight, potentiationCount: 0, depressionCount: 0, lastActivation: null };
  }
}

function ensureEvidence(s) {
  if (typeof s.evidence !== "object" || s.evidence === null) {
    s.evidence = { successRate: 0, trialCount: 0, successCount: 0, failureCount: 0 };
  }
}

const VALID_TYPES = ["excitatory", "inhibitory", "modulatory"];
const VALID_LIFECYCLES = ["active", "weakened", "dormant", "candidate_for_pruning", "pruned"];

function synapseFrom(edge = {}) {
  const s = Object.assign({}, defaultSynapse(edge.from, edge.to), edge);
  if (typeof s.weight !== "number" || !isFinite(s.weight)) s.weight = 1.0;
  ensurePlasticity(s);
  ensureEvidence(s);
  if (!VALID_TYPES.includes(s.type)) s.type = "excitatory";
  if (!VALID_LIFECYCLES.includes(s.lifecycle)) s.lifecycle = "active";
  return s;
}

function activate(synapse, context = {}) {
  const s = Object.assign({}, synapse);
  s.plasticity = Object.assign({}, s.plasticity);
  s.lastActivation = {
    trajectoryId: context.trajectory || null,
    at: new Date().toISOString(),
    episode: context.episode != null ? context.episode : (s.lastActivation?.episode || 0),
  };
  s.lastUsageEpisode = context.episode != null ? context.episode : s.lastUsageEpisode;
  return s;
}

function recordTrial(synapse, success) {
  const s = Object.assign({}, synapse);
  s.evidence = Object.assign({}, s.evidence, {
    trialCount: (s.evidence?.trialCount || 0) + 1,
    successCount: (s.evidence?.successCount || 0) + (success ? 1 : 0),
    failureCount: (s.evidence?.failureCount || 0) + (success ? 0 : 1),
  });
  const t = s.evidence.trialCount;
  const sc = s.evidence.successCount;
  s.evidence.successRate = t > 0 ? sc / t : 0;
  return s;
}

function successfulTransition(synapse) {
  return (synapse.evidence?.successRate || 0) >= 0.5;
}

function computeEffectiveWeight(synapse, plasticityPolicy = {}) {
  const w = clamp01(synapse.weight == null ? 1.0 : Number(synapse.weight));
  if (synapse.type === "inhibitory") {
    const inhibitionStrength = clamp01(synapse.inhibitionStrength == null ? 1.0 : Number(synapse.inhibitionStrength));
    return -w * inhibitionStrength;
  }
  if (synapse.type === "modulatory") {
    return 0;
  }
  return w;
}

function isPrunable(synapse, policy = {}) {
  if (!policy?.pruning?.enabled) return false;
  if (synapse.lifecycle === "pruned") return true;
  if (synapse.lifecycle !== "candidate_for_pruning") return false;
  const cooldownEpisodes = Number(policy?.pruning?.pruningCooldownEpisodes) || 20;
  if (synapse.pruningCandidateSince?.episode == null) return false;
  const currentEpisode = synapse.lastUsageEpisode || 0;
  return (currentEpisode - synapse.pruningCandidateSince.episode) > cooldownEpisodes;
}

function contextNow() {
  return new Date();
}

function usageDecayDormant(params) {
  const policy = params?.policy;
  const usageEpisode = params?.usageEpisode;
  const weight = params?.weight;
  const currentEpisode = params?.currentEpisode;
  const halfLife = Number(policy?.pruning?.decayHalfLifeEpisodes) || 80;
  if (!(usageEpisode > 0 && halfLife > 0)) return false;
  const age = currentEpisode - usageEpisode;
  const decayFactor = Math.pow(0.5, age / halfLife);
  return weight * decayFactor < 0.05;
}

function checkCandidateState(s) {
  return Number(s.pruningCandidateSince?.episode != null) ? "candidate_for_pruning" : "dormant";
}

function checkDormantOrWeakened(params) {
  const s = params?.s;
  const policy = params?.policy;
  const weight = params?.weight;
  const currentEpisode = params?.currentEpisode;
  if (usageDecayDormant({ policy, usageEpisode: s.lastUsageEpisode || 0, weight, currentEpisode })) return "dormant";
  if (weight < 0.2) return "weakened";
  return "active";
}

function lifecycleState(synapse, policy = {}) {
  const s = synapse;
  if (s.lifecycle === "pruned") return "pruned";
  if (s.lifecycle === "candidate_for_pruning") return checkCandidateState(s);
  if (s.lifecycle === "dormant") return "dormant";
  if (s.lifecycle === "weakened") return "weakened";
  const weight = clamp01(s.weight == null ? 1.0 : Number(s.weight));
  const currentEpisode = s.lastUsageEpisode || 0;
  const decayed = usageDecayDormant({ policy, usageEpisode: s.lastUsageEpisode || 0, weight, currentEpisode });
  if (decayed) return "dormant";
  if (weight < 0.2) return "weakened";
  return "active";
}

function promoteToPruningCandidate(synapse, currentEpisode = null) {
  if (synapse.lifecycle === "pruned") return synapse;
  return Object.assign({}, synapse, {
    lifecycle: "candidate_for_pruning",
    pruningCandidateSince: { episode: currentEpisode ?? synapse.lastUsageEpisode ?? 0, at: new Date().toISOString() },
  });
}

module.exports = {
  defaultSynapse,
  synapseFrom,
  activate,
  recordTrial,
  successfulTransition,
  computeEffectiveWeight,
  isPrunable,
  lifecycleState,
  promoteToPruningCandidate,
  contextNow,
};
