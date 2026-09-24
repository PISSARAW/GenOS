'use strict';

const corridorStore = require('../migration/corridorStore');

function planAntiSynchrony(input = {}) {
  const demes = Array.isArray(input.demes) ? input.demes : [];
  const observations = input.observations || {};
  const threshold = bounded(input.threshold, 0.7);
  const pairs = pairMetrics(demes, observations).filter((pair) => pair.risk >= threshold);
  const uniqueCapabilities = uniqueCapabilityOwners(demes);
  return { threshold, affectedPairs: pairs,
    protectedDemeIds: demes.filter((deme) => uniqueCapabilities.has(deme.demeId)).map((deme) => deme.demeId),
    policy: { action: input.freeze === true ? 'FREEZE' : 'REDUCE', reductionFactor: bounded(input.reductionFactor, 0.5) } };
}

async function applyAntiSynchrony(input = {}, options = {}) {
  if (!options.db || !input.metapopulationId) throw Object.assign(new Error('Database and metapopulation are required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' });
  const plan = planAntiSynchrony(input);
  const risky = new Map();
  for (const pair of plan.affectedPairs) {
    risky.set(`${pair.sourceDemeId}->${pair.targetDemeId}`, pair.risk);
    risky.set(`${pair.targetDemeId}->${pair.sourceDemeId}`, pair.risk);
  }
  const graph = await corridorStore.listGraph(options.db, input.metapopulationId);
  const corridors = graph.map((item) => adjustCorridor(item, risky, plan));
  const updated = await corridorStore.replaceGraph(options.db, input.metapopulationId,
    { topology: 'anti-synchrony', corridors });
  return { ...plan, corridors: updated };
}

function pairMetrics(demes, observations) {
  const pairs = [];
  for (let i = 0; i < demes.length; i += 1) {
    for (let j = i + 1; j < demes.length; j += 1) {
      const left = demes[i]; const right = demes[j];
      const key = `${left.demeId}->${right.demeId}`;
      const errors = correlation(observations[left.demeId]?.errors, observations[right.demeId]?.errors);
      const strategies = jaccard(left.localStrategies, right.localStrategies);
      const risk = Math.max(normalizeCorrelation(errors), strategies);
      pairs.push({ sourceDemeId: left.demeId, targetDemeId: right.demeId,
        errorCorrelation: errors, strategyOverlap: strategies, risk, pairId: key });
    }
  }
  return pairs;
}

function adjustCorridor(corridor, risks, plan) {
  const key = `${corridor.sourceDemeId}->${corridor.targetDemeId}`;
  const risk = risks.get(key);
  if (!Number.isFinite(risk)) return corridor;
  const freeze = plan.policy.action === 'FREEZE';
  return { ...corridor, enabled: freeze ? false : corridor.enabled,
    weight: Number((corridor.weight * (1 - plan.policy.reductionFactor)).toFixed(3)),
    homogenizationRisk: Math.max(corridor.homogenizationRisk, risk) };
}

function correlation(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || a.length !== b.length) return null;
  const left = a.map(Number); const right = b.map(Number);
  if ([...left, ...right].some((value) => !Number.isFinite(value))) return null;
  const meanA = average(left); const meanB = average(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - meanA) * (right[index] - meanB), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - meanA) ** 2, 0) * right.reduce((sum, value) => sum + (value - meanB) ** 2, 0));
  return denominator ? Number((numerator / denominator).toFixed(3)) : null;
}

function jaccard(a, b) {
  const left = new Set(Array.isArray(a) ? a : []); const right = new Set(Array.isArray(b) ? b : []);
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  return Number(([...left].filter((item) => right.has(item)).length / union.size).toFixed(3));
}

function uniqueCapabilityOwners(demes) {
  const owners = new Map();
  for (const deme of demes) for (const capability of deme.capabilities || []) {
    owners.set(capability, (owners.get(capability) || 0) + 1);
  }
  const unique = new Set([...owners].filter(([, count]) => count === 1).map(([capability]) => capability));
  return new Set(demes.filter((deme) => (deme.capabilities || []).some((item) => unique.has(item))).map((deme) => deme.demeId));
}

function normalizeCorrelation(value) { return Number.isFinite(value) ? Math.max(0, value) : 0; }
function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function bounded(value, fallback) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }

module.exports = { planAntiSynchrony, applyAntiSynchrony };
