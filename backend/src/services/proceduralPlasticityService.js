"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}
const genomePolicy = require("./proceduralGenomePolicyService");

function rewardFrom(context = {}) {
  const r = Object.assign({}, context);
  const success = clamp01(Number(r.success) || 0);
  const evidence = clamp01(Number(r.evidence) || (success >= 0.8 ? 1 : 0));
  const cost = clamp01(Number(r.cost) || 0);
  const safety = clamp01(Number(r.safety) || 0.5);
  const causalEffect = clamp01(Number(r.causalEffect) || (success >= 0.5 ? 0.5 : 0));

  const reward = (
    0.30 * success +
    0.20 * evidence +
    0.12 * (1 - cost) +
    0.13 * safety +
    0.13 * causalEffect +
    0.12 * (1 - Math.abs(success - evidence))
  );
  return clamp01(reward);
}

function deltaW(synapse, context = {}, policy = {}) {
  const p = genomePolicy.policyFrom(policy);
  const eta = genomePolicy.learningRateFor(p, Number(context.episodeCount) || 0);
  const reward = rewardFrom(context);
  const delta = eta * reward;
  const w = clamp01(Number(synapse.weight) || 1.0);
  return clamp01(w + delta);
}

function applyLTP(synapse, context = {}, policy = {}) {
  const p = Object.assign({}, synapse, { weight: deltaW(synapse, context, policy) });
  p.plasticity = Object.assign({}, p.plasticity || {}, {
    weight: clamp01(p.weight),
    potentiationCount: (p.plasticity?.potentiationCount || 0) + 1,
  });
  return p;
}

function applyLTD(synapse, context = {}, policy = {}) {
  const p = Object.assign({}, synapse, { weight: deltaW(synapse, context, policy) });
  p.plasticity = Object.assign({}, p.plasticity || {}, {
    weight: clamp01(p.weight),
    depressionCount: (p.plasticity?.depressionCount || 0) + 1,
  });
  return p;
}

function predictionError(expected, observed) {
  const e = clamp01(Number(expected) || 0);
  const o = clamp01(Number(observed) || 0);
  return o - e;
}

function surpriseScore(predictionError, policy = {}) {
  const absPe = Math.abs(predictionError || 0);
  const threshold = clamp01(Number(policy?.mutation?.surpriseThreshold) || 0.25);
  return { raw: absPe, threshold, isSurprising: absPe > threshold };
}

module.exports = {
  rewardFrom,
  deltaW,
  applyLTP,
  applyLTD,
  predictionError,
  surpriseScore,
};
