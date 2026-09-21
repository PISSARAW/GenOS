"use strict";

const genomePolicy = require("./proceduralGenomePolicyService");

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function homeostaticWeight(currentWeight, observedActivity, policy = {}) {
  const p = genomePolicy.policyFrom(policy);
  const target = clamp01(Number(p.homeostasis?.targetActivation) || 0.12);
  const sensitivity = clamp01(Number(p.homeostasis?.sensitivity) || 0.3);
  const obs = clamp01(Number(observedActivity) || target);
  if (obs === 0) return currentWeight;
  const ratio = target / obs;
  const adjusted = currentWeight * (1 + sensitivity * (ratio - 1));
  return clamp01(adjusted);
}

function normalizeActivations(activations, policy = {}) {
  const p = genomePolicy.policyFrom(policy);
  const target = clamp01(Number(p.homeostasis?.targetActivation) || 0.12);
  if (!Array.isArray(activations) || !activations.length) return [];
  const total = activations.reduce((acc, a) => acc + clamp01(Number(a) || 0), 0) || 1;
  const rawProportions = activations.map((a) => clamp01(Number(a) || 0) / total);
  return rawProportions.map((prop) => homeostaticWeight(prop, prop, { homeostasis: { targetActivation: target, sensitivity: p.homeostasis?.sensitivity } }));
}

function dominantProportion(activations) {
  if (!Array.isArray(activations) || !activations.length) return 0;
  const total = activations.reduce((acc, a) => acc + clamp01(Number(a) || 0), 0) || 1;
  return Math.max(...activations.map((a) => clamp01(Number(a) || 0) / total));
}

function isRigid(activations, threshold = 0.9) {
  return dominantProportion(activations) >= (threshold == null ? 0.9 : Number(threshold));
}

module.exports = {
  homeostaticWeight,
  normalizeActivations,
  dominantProportion,
  isRigid,
};
