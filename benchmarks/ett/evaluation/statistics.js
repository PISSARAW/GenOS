'use strict';

function percentile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + fraction * ((sorted[lower + 1] ?? sorted[lower]) - sorted[lower]);
}

function randomIndex(random, size) {
  return Math.floor(random() * size);
}

function differencesBySeed(pairs) {
  const groups = new Map();
  for (const pair of pairs) {
    const values = groups.get(pair.seed) || [];
    values.push(pair.treatment - pair.control);
    groups.set(pair.seed, values);
  }
  return [...groups.values()];
}

function hierarchicalSample(groups, random) {
  const sampled = [];
  for (let index = 0; index < groups.length; index += 1) {
    const cluster = groups[randomIndex(random, groups.length)];
    for (let row = 0; row < cluster.length; row += 1) {
      sampled.push(cluster[randomIndex(random, cluster.length)]);
    }
  }
  return sampled;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pairedEffectSize(pairs) {
  validatePairs(pairs);
  const differences = pairs.map((pair) => pair.treatment - pair.control);
  const average = mean(differences);
  const variance = mean(differences.map((value) => (value - average) ** 2));
  const deviation = Math.sqrt(variance * differences.length / Math.max(1, differences.length - 1));
  return deviation === 0
    ? { estimate: null, reason: 'zero_variance' }
    : { estimate: average / deviation, reason: null };
}

function validatePairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) throw new TypeError('Paired observations required.');
  if (pairs.some((pair) => !Number.isFinite(pair.treatment) || !Number.isFinite(pair.control)
    || pair.seed === undefined)) throw new TypeError('Each pair needs seed and finite outcomes.');
}

function seededRandom(seed) {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function bootstrapMeans(groups, replicates, random) {
  const samples = [];
  for (let index = 0; index < replicates; index += 1) samples.push(mean(hierarchicalSample(groups, random)));
  return samples;
}

function validateBootstrapOptions(options) {
  const replicates = options.replicates ?? 10000;
  const confidence = options.confidence ?? 0.95;
  if (!Number.isSafeInteger(replicates) || replicates < 1) throw new RangeError('Bootstrap replicates must be a positive integer.');
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new RangeError('Confidence level must be between zero and one.');
  }
  return { replicates, confidence };
}

function pairedHierarchicalBootstrap(pairs, options = {}) {
  validatePairs(pairs);
  const settings = validateBootstrapOptions(options);
  const groups = differencesBySeed(pairs);
  const samples = bootstrapMeans(groups, settings.replicates, seededRandom(options.seed));
  const tail = (1 - settings.confidence) / 2;
  return { estimate: mean(pairs.map((pair) => pair.treatment - pair.control)),
    confidence: settings.confidence,
    lower: percentile(samples, tail), upper: percentile(samples, 1 - tail),
    seedCount: groups.length, pairCount: pairs.length, replicates: settings.replicates };
}

function validateComparisons(comparisons) {
  if (!Array.isArray(comparisons) || comparisons.length === 0) throw new TypeError('Comparisons are required.');
  const ids = comparisons.map((item) => item?.id);
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length
    || comparisons.some((item) => !Number.isFinite(item.pValue) || item.pValue < 0 || item.pValue > 1)) {
    throw new TypeError('Comparisons need unique ids and p-values in [0, 1].');
  }
}

function holmCorrection(comparisons) {
  validateComparisons(comparisons);
  const ranked = comparisons.map((item, index) => ({ ...item, index }))
    .sort((left, right) => left.pValue - right.pValue);
  let adjustedFloor = 0;
  const corrected = ranked.map((item, rank) => {
    const adjusted = Math.min(1, (ranked.length - rank) * item.pValue);
    adjustedFloor = Math.max(adjustedFloor, adjusted);
    return { id: item.id, pValue: item.pValue, adjustedPValue: adjustedFloor };
  });
  return corrected.sort((left, right) => comparisons.findIndex((item) => item.id === left.id)
    - comparisons.findIndex((item) => item.id === right.id));
}

module.exports = { pairedHierarchicalBootstrap, pairedEffectSize, holmCorrection };
