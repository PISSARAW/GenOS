'use strict';

const DEFAULT_PRIOR = { mean: 0.5, variance: 0.25, count: 0 };
const SHRINKAGE_FACTOR = 10;

function createPrior(stats = {}) {
  return {
    mean: stats.mean ?? DEFAULT_PRIOR.mean,
    variance: stats.variance ?? DEFAULT_PRIOR.variance,
    count: stats.count ?? 0,
    updatedAt: new Date().toISOString()
  };
}

function updatePrior(prior, observation, weight = 1) {
  const n = prior.count + weight;
  const newMean = (prior.mean * prior.count + observation * weight) / n;
  const newVariance = n > 1
    ? (prior.variance * (prior.count - 1) + weight * (observation - newMean) ** 2) / (n - 1)
    : prior.variance;
  return {
    ...prior,
    mean: newMean,
    variance: Math.max(0.001, newVariance),
    count: n,
    updatedAt: new Date().toISOString()
  };
}

function shrinkPrior(prior, globalPrior, shrinkageFactor = SHRINKAGE_FACTOR) {
  if (prior.count >= shrinkageFactor) return prior;
  const weight = prior.count / (prior.count + shrinkageFactor);
  return {
    mean: weight * prior.mean + (1 - weight) * globalPrior.mean,
    variance: weight * prior.variance + (1 - weight) * globalPrior.variance,
    count: prior.count,
    updatedAt: new Date().toISOString()
  };
}

function isObj(v) { return typeof v === 'object' && v !== null; }

function computeContextSimilarity(contextA, contextB) {
  if (!contextA || !contextB) return 0;
  const keys = new Set([...Object.keys(contextA), ...Object.keys(contextB)]);
  let matches = 0, total = 0;
  for (const key of keys) {
    const a = contextA[key], b = contextB[key];
    if (a === undefined && b === undefined) continue;
    total++;
    if (a === b) matches++;
    else if (isObj(a) && isObj(b)) matches += computeContextSimilarity(a, b) * 0.5;
  }
  return total > 0 ? matches / total : 0;
}

function blendPriors(priors, similarities, globalPrior) {
  if (!priors.length) return globalPrior;
  let weightedSum = 0, totalWeight = 0;
  for (let i = 0; i < priors.length; i++) {
    const w = similarities[i] || 0;
    weightedSum += priors[i].mean * w;
    totalWeight += w;
  }
  return totalWeight === 0
    ? globalPrior
    : { ...globalPrior, mean: weightedSum / totalWeight, updatedAt: new Date().toISOString() };
}

function computeConfidenceInterval(prior, confidence = 0.95) {
  if (prior.count < 2) return { lower: 0, upper: 1 };
  const z = confidence >= 0.99 ? 2.576 : confidence >= 0.95 ? 1.96 : 1.645;
  const se = Math.sqrt(prior.variance / prior.count);
  return { lower: Math.max(0, prior.mean - z * se), upper: Math.min(1, prior.mean + z * se) };
}

class MorphologyPriorService {
  constructor(opts = {}) {
    this.priors = new Map();
    this.globalPriors = {
      outcome: createPrior(),
      cost: createPrior(),
      latency: createPrior(),
      failure: createPrior(),
      transition: createPrior()
    };
    this.shrinkageFactor = opts.shrinkageFactor || 10;
    this.minCount = opts.minCount || 5;
  }

  getPrior(key, type = 'outcome') {
    const map = this.priors.get(type) || new Map();
    const prior = map.get(key);
    return prior ? shrinkPrior(prior, this.globalPriors[type], this.shrinkageFactor) : this.globalPriors[type];
  }

  update(key, observation, type = 'outcome', weight = 1) {
    if (!this.priors.has(type)) this.priors.set(type, new Map());
    const map = this.priors.get(type);
    const prior = map.get(key) || createPrior();
    map.set(key, updatePrior(prior, observation, weight));
    this.updateGlobalPrior(type);
    return map.get(key);
  }

  getContextualPrior(context, type = 'outcome', fallbackKeys = []) {
    const contextKey = this.contextToKey(context);
    let prior = this.getPrior(contextKey, type);
    if (prior.count >= this.minCount || !fallbackKeys.length)
      return prior;
    const similar = fallbackKeys
      .map(k => ({ key: k, prior: this.getPrior(k, type), sim: this.keySimilarity(contextKey, k) }))
      .filter(s => s.sim > 0.3)
      .sort((a, b) => b.sim - a.sim);
    if (similar.length)
      prior = blendPriors(similar.map(s => s.prior), similar.map(s => s.sim), this.globalPriors[type]);
    return prior;
  }

  contextToKey(context) {
    if (!context) return 'default';
    const parts = [];
    if (context.topology) parts.push(`topology:${context.topology}`);
    if (context.variant) parts.push(`variant:${context.variant}`);
    if (context.problemType) parts.push(`problem:${context.problemType}`);
    if (context.complexity) parts.push(`complexity:${context.complexity}`);
    return parts.join('|') || 'default';
  }

  keySimilarity(keyA, keyB) {
    const partsA = keyA.split('|');
    const partsB = keyB.split('|');
    const all = new Set([...partsA, ...partsB]);
    let matches = 0;
    for (const p of all)
      if (partsA.includes(p) && partsB.includes(p)) matches++;
    return (partsA.length + partsB.length) > 0
      ? matches / Math.max(partsA.length, partsB.length)
      : 0;
  }

  updateGlobalPrior(type) {
    const map = this.priors.get(type);
    if (!map || map.size === 0) return;
    let sum = 0, weight = 0;
    for (const prior of map.values()) {
      const w = Math.min(prior.count, 100);
      sum += prior.mean * w;
      weight += w;
    }
    if (weight > 0)
      this.globalPriors[type] = { ...this.globalPriors[type], mean: sum / weight, updatedAt: new Date().toISOString() };
  }

  getAllPriors(type) {
    return Array.from((this.priors.get(type) || new Map()).entries())
      .map(([key, value]) => ({ key, ...value }));
  }

  getGlobalPrior(type) { return { ...this.globalPriors[type] }; }

  getConfidenceInterval(key, type = 'outcome', confidence = 0.95) {
    return computeConfidenceInterval(this.getPrior(key, type), confidence);
  }
}

module.exports = {
  createPrior, updatePrior, shrinkPrior,
  computeContextSimilarity, blendPriors, computeConfidenceInterval,
  MorphologyPriorService,
  DEFAULT_PRIOR, SHRINKAGE_FACTOR
};
