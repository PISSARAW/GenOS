"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const DEFAULT_POLICY = Object.freeze({
  plasticity: { enabled: true, learningRate: "adaptive", maxDelta: 0.15 },
  consolidation: { threshold: 0.82, minEpisodes: 3, sleepCycles: 2 },
  pruning: { enabled: true, decayHalfLifeEpisodes: 80 },
  mutation: { maxStructuralChange: 3, surpriseThreshold: 0.25 },
  inheritance: { acquiredProcedures: "validated_only", requireEvidence: true },
  selection: { damping: 0.6 },
  homeostasis: { targetActivation: 0.12, sensitivity: 0.3 },
  fitnessWeights: {
    success: 0.30,
    robustness: 0.20,
    evidence: 0.20,
    generalization: 0.10,
    cost: 0.08,
    risk: 0.07,
    complexity: 0.05,
  },
});

function policyFrom(input = {}) {
  const merged = Object.assign({}, DEFAULT_POLICY, input);
  for (const key of Object.keys(DEFAULT_POLICY)) {
    const sub = input[key];
    const def = DEFAULT_POLICY[key];
    if (sub && typeof sub === 'object' && def && typeof def === 'object' && !Array.isArray(sub)) {
      merged[key] = Object.assign({}, def, sub);
    }
  }
  return merged;
}

function genomeEncodesLearningRules(genome = {}) {
  const phen = genome.expressedPhenotype || genome.phenotype || genome;
  if (!phen || typeof phen !== "object") return false;
  const hasPolicy = phen.procedural_policy != null || phen.plasticity != null || phen.consolidation != null;
  return hasPolicy;
}

function isInnate(genome = {}) {
  return genome.encodedAsLearningRules === true && genomeEncodesLearningRules(genome);
}

function isAcquired(genome = {}) {
  return genome.encodedAsLearningRules === false;
}

function learningRateFor(policy, episodeCount) {
  if (!policy.plasticity.enabled) return 0;
  if (policy.plasticity.learningRate === "adaptive") {
    const base = clamp01(1 / Math.log(1 + episodeCount || 1));
    return clamp01(base * (policy.plasticity.maxDelta || 0.15));
  }
  return clamp01(Number(policy.plasticity.learningRate) || 0.05);
}

function consolidationThreshold(policy) {
  return clamp01(Number(policy.consolidation?.threshold) || 0.82);
}

function isInheritanceValidatedOnly(policy) {
  const mode = String(policy?.inheritance?.acquiredProcedures || "").toLowerCase();
  return mode === "validated_only" || mode === "evidence_only";
}

function requiresEvidence(policy) {
  return Boolean(policy?.inheritance?.requireEvidence);
}

module.exports = {
  DEFAULT_POLICY,
  policyFrom,
  genomeEncodesLearningRules,
  isInnate,
  isAcquired,
  learningRateFor,
  consolidationThreshold,
  isInheritanceValidatedOnly,
  requiresEvidence,
};
