'use strict';

const syn = require('./proceduralSynapseService');

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const LIFECYCLE_ORDER = ['active', 'weakened', 'dormant', 'candidate_for_pruning', 'pruned'];

function decayEffectiveWeight(s, policy, currentEpisode = null) {
  const weight = clamp01(s.weight == null ? 1.0 : Number(s.weight));
  const usageEpisode = s.lastUsageEpisode || 0;
  const halfLife = Number(policy?.pruning?.decayHalfLifeEpisodes) || 80;
  const atEpisode = currentEpisode != null ? currentEpisode : usageEpisode;
  if (!(usageEpisode > 0 && halfLife > 0)) return weight;
  const age = atEpisode - usageEpisode;
  const decayFactor = Math.pow(0.5, age / halfLife);
  return weight * decayFactor;
}

function nextLifecycle(s) {
  return s.lifecycle === 'active' ? 'weakened' : s.lifecycle === 'weakened' ? 'dormant' : s.lifecycle;
}

function pruneEligibility(synapse, policy = {}, currentEpisode = null) {
  const s = syn.synapseFrom(synapse);
  const lifecycle = syn.lifecycleState(s, policy);
  if (lifecycle === 'pruned') return { eligible: true, state: 'pruned', reason: 'already_pruned' };
  if (lifecycle === 'candidate_for_pruning') {
    if (syn.isPrunable(s, policy)) {
      return { eligible: true, state: 'pruned', reason: 'pruning_cooldown_elapsed' };
    }
    return { eligible: false, state: 'candidate_for_pruning', reason: 'cooldown_not_elapsed' };
  }
  const effective = decayEffectiveWeight(s, policy, currentEpisode);
  if (effective < 0.05) {
    return { eligible: false, state: nextLifecycle(s), reason: 'decay_below_threshold', effectiveWeight: effective };
  }
  const w = clamp01(s.weight == null ? 1.0 : Number(s.weight));
  if (w < 0.2 && (s.evidence?.successRate ?? 1) < 0.2) {
    return { eligible: false, state: 'candidate_for_pruning', reason: 'low_weight_low_success', candidate: true };
  }
  return { eligible: false, state: 'active', reason: 'still_active', effectiveWeight: effective };
}

function weaken(synapse) {
  const s = syn.synapseFrom(synapse);
  if (s.lifecycle === 'pruned') return s;
  const current = LIFECYCLE_ORDER.indexOf(s.lifecycle);
  const nextIndex = Math.min(current + 1, LIFECYCLE_ORDER.length - 2);
  const nextState = LIFECYCLE_ORDER[nextIndex];
  return Object.assign({}, s, {
    lifecycle: nextState,
    lastActivation: { ...s.lastActivation, at: new Date().toISOString() },
  });
}

function revive(synapse) {
  const s = syn.synapseFrom(synapse);
  if (s.lifecycle === 'pruned') return s;
  const current = LIFECYCLE_ORDER.indexOf(s.lifecycle);
  const prevIndex = Math.max(current - 1, 0);
  const prevState = LIFECYCLE_ORDER[prevIndex];
  return Object.assign({}, s, {
    lifecycle: prevState,
    pruningCandidateSince: null,
  });
}

function prune(synapse) {
  if (synapse.lifecycle === 'pruned') return synapse;
  return Object.assign({}, synapse, {
    lifecycle: 'pruned',
    prunedAt: new Date().toISOString(),
  });
}

function pruneCandidates(synapses, policy = {}, currentEpisode = null) {
  return synapses
    .map((s) => ({ synapse: s, assessment: pruneEligibility(s, policy, currentEpisode) }))
    .map(({ synapse, assessment }) => {
      if (assessment.eligible && assessment.state === 'pruned') {
        return { synapse: prune(synapse), assessment };
      }
      if (assessment.candidate && synapse.lifecycle !== 'candidate_for_pruning') {
        return { synapse: syn.promoteToPruningCandidate(synapse, currentEpisode), assessment };
      }
      return { synapse, assessment };
    });
}

module.exports = {
  LIFECYCLE_ORDER,
  pruneEligibility,
  weaken,
  revive,
  prune,
  pruneCandidates,
};
