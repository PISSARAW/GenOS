'use strict';

const DEFAULT_STRATA = Object.freeze(['expertise', 'provider', 'lineage']);

function stratumKey(member, dimensions) {
  return dimensions.map((dimension) => String(member[dimension] || 'unknown')).join('|');
}

function stratify(input = {}) {
  const population = Array.isArray(input.population) ? input.population : [];
  if (!population.length) throw samplingError('BIOCENOSE_SAMPLING_EMPTY', 'Stratification requires a non-empty population.');
  const dimensions = Array.isArray(input.dimensions) && input.dimensions.length ? input.dimensions : [...DEFAULT_STRATA];
  const strata = new Map();
  population.forEach((member, index) => {
    const key = stratumKey(member, dimensions);
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(String(member.memberId || `member_${index}`));
  });
  return {
    dimensions,
    populationSize: population.length,
    strata: [...strata.entries()].map(([stratum, memberIds]) => ({
      stratum, memberIds, size: memberIds.length, share: Number((memberIds.length / population.length).toFixed(4))
    }))
  };
}

function quotaFor(stratum, quotas, totalQuota) {
  if (quotas && Number.isFinite(Number(quotas[stratum.stratum]))) return Math.max(0, Number(quotas[stratum.stratum]));
  if (totalQuota) return Math.max(1, Math.round(stratum.share * totalQuota));
  return Math.max(1, Math.ceil(stratum.size / 2));
}

function quotaSample(input = {}) {
  const stratified = stratify(input);
  const quotas = input.quotas && typeof input.quotas === 'object' ? input.quotas : null;
  const totalQuota = Number(input.totalQuota) || 0;
  const sample = [];
  const unfilled = [];
  for (const stratum of stratified.strata) {
    const ordered = [...stratum.memberIds].sort();
    const quota = Math.min(quotaFor(stratum, quotas, totalQuota), ordered.length);
    sample.push(...ordered.slice(0, quota).map((memberId) => ({ memberId, stratum: stratum.stratum })));
    if (quota < ordered.length) unfilled.push({ stratum: stratum.stratum, missing: ordered.length - quota });
  }
  return { sample, sampleSize: sample.length, strata: stratified.strata.length, unfilled };
}

function reweight(input = {}) {
  const population = Array.isArray(input.population) ? input.population : [];
  const sample = Array.isArray(input.sample) ? input.sample : [];
  if (!sample.length) throw samplingError('BIOCENOSE_SAMPLING_EMPTY', 'Reweighting requires a non-empty sample.');
  const stratified = stratify({ population, dimensions: input.dimensions });
  const sampledIds = new Set(sample.map((item) => item.memberId || item));
  const weights = {};
  for (const stratum of stratified.strata) {
    const sampled = stratum.memberIds.filter((id) => sampledIds.has(id)).length;
    const weight = sampled > 0 ? (stratum.size / population.length) / (sampled / sample.length) : 0;
    for (const id of stratum.memberIds.filter((memberId) => sampledIds.has(memberId))) {
      weights[id] = Number(weight.toFixed(4));
    }
  }
  return { weights, strata: stratified.strata.length };
}

function effectiveSampleSize(input = {}) {
  const values = Object.values(input.weights || {}).map(Number).filter(Number.isFinite);
  if (!values.length) throw samplingError('BIOCENOSE_SAMPLING_EMPTY', 'Effective sample size requires at least one weight.');
  const sum = values.reduce((total, value) => total + value, 0);
  const sumSquares = values.reduce((total, value) => total + value * value, 0);
  if (sumSquares <= 0) return { effectiveSampleSize: 0, nominalSize: values.length, efficiency: 0 };
  const ess = (sum * sum) / sumSquares;
  return {
    effectiveSampleSize: Number(ess.toFixed(3)),
    nominalSize: values.length,
    efficiency: Number((ess / values.length).toFixed(3))
  };
}

function samplingError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { stratify, quotaSample, reweight, effectiveSampleSize, DEFAULT_STRATA };
