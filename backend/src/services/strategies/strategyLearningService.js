'use strict';

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const DECAY_FACTOR = 0.95;
const MIN_EXPERIENCES_FOR_STATS = 1;

function recordExperience(ctx) {
  const {
    problemFeatures,
    strategy,
    recipe,
    topology,
    model,
    outcome,
    tokens,
    latency,
    evidenceGain,
    informationGain,
  } = ctx || {};
  if (!strategy) throw new Error('strategy is required');
  if (!outcome) throw new Error('outcome is required');
  return {
    id: generateId('exp'),
    problemFeatures: problemFeatures || {},
    strategy: typeof strategy === 'string' ? strategy : strategy.id,
    recipe: recipe || null,
    topology: topology || null,
    model: model || null,
    outcome,
    tokens: Number.isFinite(tokens) ? tokens : null,
    latency: Number.isFinite(latency) ? latency : null,
    evidenceGain: Number.isFinite(evidenceGain) ? evidenceGain : null,
    informationGain: Number.isFinite(informationGain) ? informationGain : null,
    recordedAt: new Date().toISOString(),
  };
}

function getExperiences() {
  if (!global.__strategyExperiences) global.__strategyExperiences = [];
  return global.__strategyExperiences;
}

function saveExperience(experience) {
  const store = getExperiences();
  store.push(experience);
  return experience;
}

function storeExperience(ctx) {
  const experience = recordExperience(ctx);
  return saveExperience(experience);
}

function getStrategyStats(strategyId) {
  const experiences = getExperiences().filter((e) => e.strategy === strategyId);
  const uses = experiences.length;
  const successes = experiences.filter((e) => e.outcome?.success).length;
  const avgUtility = uses > 0
    ? experiences.reduce((s, e) => s + (e.outcome?.utility || 0), 0) / uses
    : 0;
  const decayedUtility = computeDecayedUtility(experiences);
  return {
    uses,
    successes,
    successRate: uses > 0 ? Number((successes / uses).toFixed(3)) : 0,
    avgUtility: Number(avgUtility.toFixed(3)),
    decayedUtility: Number(decayedUtility.toFixed(3)),
  };
}

function computeDecayedUtility(experiences) {
  if (!experiences.length) return 0;
  const sorted = [...experiences].sort(
    (a, b) => new Date(a.recordedAt) - new Date(b.recordedAt)
  );
  let weightedSum = 0;
  let weightTotal = 0;
  sorted.forEach((exp, idx) => {
    const weight = Math.pow(DECAY_FACTOR, sorted.length - 1 - idx);
    const utility = exp.outcome?.utility || 0;
    weightedSum += utility * weight;
    weightTotal += weight;
  });
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

function predictUtility(ctx) {
  const { strategyId, problemFeatures } = ctx || {};
  if (!strategyId) throw new Error('strategyId is required');
  const stats = getStrategyStats(strategyId);
  if (stats.uses < MIN_EXPERIENCES_FOR_STATS) {
    return {
      strategyId,
      predictedUtility: 0,
      confidence: 0,
      basis: 'insufficient data',
    };
  }
  const featureBoost = computeFeatureBoost(strategyId, problemFeatures || {});
  const predicted = stats.decayedUtility * (1 + featureBoost);
  const confidence = Math.min(1, stats.uses / 20);
  return {
    strategyId,
    predictedUtility: Number(Math.max(0, predicted).toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    basis: stats.uses >= 10 ? 'strong empirical data' : 'limited empirical data',
  };
}

function computeFeatureBoost(strategyId, problemFeatures) {
  const experiences = getExperiences().filter((e) => e.strategy === strategyId);
  if (!experiences.length) return 0;
  const recent = experiences.slice(-5);
  let totalBoost = 0;
  for (const exp of recent) {
    const expFeatures = exp.problemFeatures || {};
    const keys = new Set([...Object.keys(expFeatures), ...Object.keys(problemFeatures)]);
    if (!keys.size) continue;
    let matches = 0;
    for (const key of keys) {
      if (expFeatures[key] === problemFeatures[key]) matches += 1;
    }
    totalBoost += (matches / keys.size) * 0.1;
  }
  return totalBoost / recent.length;
}

module.exports = {
  recordExperience,
  getStrategyStats,
  predictUtility,
  storeExperience,
};
