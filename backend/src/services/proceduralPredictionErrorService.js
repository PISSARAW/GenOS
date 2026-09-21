"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}
const plasticity = require("./proceduralPlasticityService");
const genomePolicy = require("./proceduralGenomePolicyService");

function predictionContext(input = {}) {
  return {
    expectedReward: clamp01(Number(input.expectedReward) || 0),
    observedReward: clamp01(Number(input.observedReward) || 0),
    context: input.context || {},
    episodeCount: Number(input.episodeCount) || 0,
  };
}

function computePredictionError(ctx) {
  const c = predictionContext(ctx);
  const delta = plasticity.predictionError(c.expectedReward, c.observedReward);
  return {
    delta,
    expected: c.expectedReward,
    observed: c.observedReward,
    signedDelta: delta,
    absolute: Math.abs(delta),
  };
}

function peAction(pe, policy = {}) {
  const p = genomePolicy.policyFrom(policy);
  const abs = Math.abs(pe.delta);
  const threshold = clamp01(Number(p?.mutation?.surpriseThreshold) || 0.25);
  const result = {
    delta: pe.delta,
    isSurprising: abs > threshold,
    triggerLTD: pe.delta < -0.15,
    triggerLTP: pe.delta > 0.15,
    increaseLocalPlasticity: abs > threshold,
    triggerMutationSearch: abs > threshold && pe.delta < -0.25,
    note: null,
  };
  if (result.isSurprising) {
    if (pe.delta < -0.25) {
      result.note = "negative_surprise: LTD + increased plasticity + mutation search";
    } else if (pe.delta > 0.25) {
      result.note = "positive_surprise: investigate useful transition";
    } else {
      result.note = "surprise: increased plasticity only";
    }
  } else {
    result.note = "expected_outcome: no structural change";
  }
  return result;
}

function expectedRewardFrom(synapse, recentSuccesses = 0, totalTrials = 1) {
  const rate = totalTrials > 0 ? recentSuccesses / totalTrials : 0.5;
  return clamp01(rate * 0.8 + 0.1);
}

module.exports = {
  predictionContext,
  computePredictionError,
  peAction,
  expectedRewardFrom,
};
