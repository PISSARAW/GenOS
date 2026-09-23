'use strict';

const MAX_EXPERIENCES = 500;
const DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
const FEATURE_KEYS = ['complexity', 'domain', 'urgency', 'scale', 'interdependency'];

let experiences = [];

function normalizeFeatures(features) {
  const v = {};
  for (const key of FEATURE_KEYS) v[key] = Number(features[key]) || 0;
  return v;
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (const key of FEATURE_KEYS) {
    dot += a[key] * b[key];
    magA += a[key] * a[key];
    magB += b[key] * b[key];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function decayWeight(timestamp, now) {
  const decayConstant = Math.LN2 / DECAY_HALF_LIFE_MS;
  return Math.exp(-decayConstant * Math.max(0, now - timestamp));
}

function baseUtility(success) {
  if (success === true) return 1;
  if (success === 'partial') return 0.5;
  if (success === false) return 0;
  return 0.5;
}

function computeUtility(outcome) {
  if (!outcome) return 0.5;
  let utility = baseUtility(outcome.success);
  const quality = Number(outcome.quality);
  if (Number.isFinite(quality)) utility *= quality;
  const evidence = Number(outcome.evidenceQuality);
  if (Number.isFinite(evidence)) utility *= evidence;
  if (outcome.failures && outcome.failures.length > 0) utility *= Math.max(0, 1 - outcome.failures.length * 0.1);
  return Math.max(0, Math.min(1, utility));
}

function computeConfidence(experiences, similarity) {
  if (experiences.length === 0) return 0;
  const avgSimilarity = experiences.reduce((s, e) => s + e.similarity, 0) / experiences.length;
  return Math.min(1, Math.sqrt(experiences.length) * avgSimilarity * similarity);
}

function getMorphologyKey(morphology) {
  if (!morphology) return '';
  const caps = (morphology.capabilities || []).sort().join(',');
  const topo = morphology.topology || '';
  const pheno = (morphology.phenotypes || []).sort().join(',');
  return `${caps}|${topo}|${pheno}`;
}

function jaccardSimilarity(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) { if (b.has(item)) intersection++; }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function morphologySimilarity(a, b) {
  const capSim = jaccardSimilarity(new Set(a.capabilities || []), new Set(b.capabilities || []));
  const phenoSim = jaccardSimilarity(new Set(a.phenotypes || []), new Set(b.phenotypes || []));
  const topoSim = a.topology === b.topology ? 1 : 0;
  return (capSim + phenoSim + topoSim) / 3;
}

function scoreExperience({ exp, queryFeatures, morphology, now }) {
  const featureSim = cosineSimilarity(queryFeatures, exp.problemFeatures);
  const morphSim = morphology ? morphologySimilarity(morphology, exp.morphology) : 1;
  const timeWeight = decayWeight(exp.timestamp, now);
  return { ...exp, featureSimilarity: featureSim, morphologySimilarity: morphSim, timeWeight, combinedWeight: featureSim * morphSim * timeWeight };
}

function compareByCombinedWeight(a, b) {
  return b.combinedWeight - a.combinedWeight;
}

function findSimilarExperiences({ features, morphology, limit }) {
  const queryFeatures = normalizeFeatures(features);
  const now = Date.now();
  const lim = limit || 10;
  return experiences.map((exp) => scoreExperience({ exp, queryFeatures, morphology, now })).sort(compareByCombinedWeight).slice(0, lim);
}

const FIELD_DEFAULTS = [
  ['initialState', null],
  ['capabilities', []],
  ['topology', ''],
  ['phenotypes', []],
  ['relations', []],
  ['transitionSequence', []],
  ['outcome', {}],
  ['failures', []],
  ['counterfactualBaseline', null],
  ['morphology', {}],
];

function buildExperienceRecord(ctx) {
  const record = {
    problemFeatures: normalizeFeatures(ctx.problemFeatures),
    evidenceQuality: Number(ctx.evidenceQuality) || 0.5,
    tokenCost: Number(ctx.tokenCost) || 0,
    latency: Number(ctx.latency) || 0,
    morphologyKey: getMorphologyKey(ctx.morphology),
    timestamp: Date.now(),
  };
  for (const [key, defaultValue] of FIELD_DEFAULTS) {
    record[key] = ctx[key] !== undefined ? ctx[key] : defaultValue;
  }
  return record;
}

function recordExperience(ctx) {
  if (!ctx || !ctx.problemFeatures) return null;
  const exp = buildExperienceRecord(ctx);
  experiences.push(exp);
  if (experiences.length > MAX_EXPERIENCES) experiences = experiences.slice(-MAX_EXPERIENCES);
  return exp;
}

function predictOutcome(ctx) {
  if (!ctx || !ctx.problemFeatures) return { predictedOutcome: 0.5, confidence: 0, similarExperiences: [] };
  const similar = findSimilarExperiences({ features: ctx.problemFeatures, morphology: ctx.candidateMorphology, limit: 10 });
  if (!similar.length) return { predictedOutcome: 0.5, confidence: 0, similarExperiences: [] };
  let weightedSum = 0, weightTotal = 0;
  for (const exp of similar) {
    const utility = computeUtility(exp.outcome);
    weightedSum += utility * exp.combinedWeight;
    weightTotal += exp.combinedWeight;
  }
  const predictedOutcome = weightTotal === 0 ? 0.5 : weightedSum / weightTotal;
  const confidence = computeConfidence(similar, cosineSimilarity(normalizeFeatures(ctx.problemFeatures), similar[0].problemFeatures));
  return {
    predictedOutcome: Number(predictedOutcome.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    similarExperiences: similar.map((e) => { return { morphologyKey: e.morphologyKey, outcome: e.outcome, similarity: Number(e.combinedWeight.toFixed(4)), timestamp: e.timestamp }; }),
  };
}

function scoreMorphology({ stats, constraints }) {
  const avgUtility = stats.utilities.reduce((a, b) => a + b, 0) / stats.utilities.length;
  const avgWeight = stats.weights.reduce((a, b) => a + b, 0) / stats.weights.length;
  const sampleBonus = Math.min(1, stats.count / 5);
  let score = avgUtility * avgWeight * sampleBonus;
  if (constraints.maxTokenCost && stats.morphology.estimatedTokenCost > constraints.maxTokenCost) score *= 0.5;
  if (constraints.maxLatency && stats.morphology.estimatedLatency > constraints.maxLatency) score *= 0.5;
  return score;
}

function getOptimalMorphology(ctx) {
  if (!ctx || !ctx.problemFeatures) return null;
  const similar = findSimilarExperiences({ features: ctx.problemFeatures, limit: 20 });
  const morphStats = new Map();
  for (const exp of similar) {
    const key = exp.morphologyKey;
    if (!morphStats.has(key)) morphStats.set(key, { morphology: exp.morphology, utilities: [], weights: [], count: 0 });
    const stats = morphStats.get(key);
    stats.utilities.push(computeUtility(exp.outcome));
    stats.weights.push(exp.combinedWeight);
    stats.count++;
  }
  let best = null, bestScore = -Infinity;
  for (const [, stats] of morphStats) {
    const score = scoreMorphology({ stats, constraints: ctx.constraints || {} });
    if (score > bestScore) { bestScore = score; best = stats.morphology; }
  }
  if (!best) best = { capabilities: ['ADAPTIVE'], topology: 'flat', phenotypes: ['AdaptiveWorker'], relations: [] };
  return { morphology: best, score: Number(bestScore.toFixed(4)), confidence: similar.length > 0 ? Math.min(1, similar.length / 10) : 0, basedOnExperiences: similar.length };
}

function pruneOldExperiences(keepLast) {
  const n = keepLast || MAX_EXPERIENCES;
  if (experiences.length > n) experiences = experiences.slice(-n);
  return experiences.length;
}

function getStats() {
  return {
    totalExperiences: experiences.length,
    uniqueMorphologies: new Set(experiences.map((e) => { return e.morphologyKey; })).size,
    oldestTimestamp: experiences.length > 0 ? experiences[0].timestamp : null,
    newestTimestamp: experiences.length > 0 ? experiences[experiences.length - 1].timestamp : null,
  };
}

module.exports = {
  recordExperience, predictOutcome, getOptimalMorphology,
  pruneOldExperiences, getStats, FEATURE_KEYS,
  _internals: { experiences, normalizeFeatures, cosineSimilarity, decayWeight },
};
