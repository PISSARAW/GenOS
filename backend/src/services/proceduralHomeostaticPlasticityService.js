"use strict";

const genomePolicy = require("./proceduralGenomePolicyService");

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function num(value, fallback = 0) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function homeostaticWeight(currentWeight, observedActivity, policy = {}) {
  const p = genomePolicy.policyFrom(policy);
  const target = clamp01(num(p.homeostasis?.targetActivation, 0.12));
  const sensitivity = clamp01(num(p.homeostasis?.sensitivity, 0.3));
  const obs = clamp01(num(observedActivity));
  if (obs === 0) return currentWeight;
  const ratio = target / obs;
  const adjusted = currentWeight * (1 + sensitivity * (ratio - 1));
  return clamp01(adjusted);
}

function normalizeActivations(activations, policy = {}) {
  const p = genomePolicy.policyFrom(policy);
  const target = clamp01(num(p.homeostasis?.targetActivation, 0.12));
  if (!Array.isArray(activations) || !activations.length) return [];
  const vals = activations.map((a) => clamp01(num(a)));
  const total = vals.reduce((acc, a) => acc + a, 0) || 1;
  const rawProportions = vals.map((a) => a / total);
  return rawProportions.map((prop) => homeostaticWeight(prop, prop, { homeostasis: { targetActivation: target, sensitivity: p.homeostasis?.sensitivity } }));
}

function dominantProportion(activations) {
  if (!Array.isArray(activations) || !activations.length) return 0;
  const vals = activations.map((a) => clamp01(num(a)));
  const total = vals.reduce((acc, a) => acc + a, 0) || 1;
  return Math.max(...vals.map((a) => a / total));
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
