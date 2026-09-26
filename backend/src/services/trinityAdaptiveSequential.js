'use strict';

const crypto = require('crypto');

const MIN_REPLICAS_PER_ARM = 1;
const MAX_REPLICAS_PER_ARM = 5;
const DEFAULT_INFO_GAIN_THRESHOLD = 0.02;

function computeInformationGain(prior, posterior) {
  if (!prior || !posterior) return 0;
  let kl = 0;
  for (const [k, v] of Object.entries(posterior)) {
    const p = prior[k] || 1e-6;
    kl += v * Math.log(v / p);
  }
  return kl;
}

function thompsonSample(arms, rng = Math.random) {
  const samples = arms.map(arm => ({
    ...arm,
    sample: betaSample(arm.alpha, arm.beta, rng)
  }));
  samples.sort((a, b) => b.sample - a.sample);
  return samples[0];
}

function betaSample(alpha, beta, rng) {
  const gamma1 = gammaSample(alpha, 1, rng);
  const gamma2 = gammaSample(beta, 1, rng);
  return gamma1 / (gamma1 + gamma2);
}

function gammaSample(shape, scale, rng) {
  if (shape >= 1) {
    const d = shape - 1/3;
    const c = 1/Math.sqrt(9*d);
    while (true) {
      let x, v;
      do { x = normalSample(rng); v = 1 + c*x; } while (v <= 0);
      v = v*v*v;
      const u = rng();
      if (u < 1 - 0.0331*x*x*x*x) return d*v*scale;
      if (Math.log(u) < 0.5*x*x + d*(1 - v + Math.log(v))) return d*v*scale;
    }
  } else {
    return gammaSample(shape + 1, scale, rng) * Math.pow(rng(), 1/shape);
  }
}

function normalSample(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function updateArm(arm, reward) {
  if (reward >= 0.5) arm.alpha += 1; else arm.beta += 1;
  arm.pulls += 1;
  arm.meanReward = (arm.meanReward * (arm.pulls - 1) + reward) / arm.pulls;
}

function inverseProbabilityWeight(arm, allArms) {
  const totalPulls = allArms.reduce((s, a) => s + a.pulls, 0);
  const prob = arm.pulls / totalPulls;
  return prob > 0 ? 1 / prob : 1;
}

function sequentialAllocate(input) {
  const { arms, totalBudget, spentBudget, config = {} } = input;
  const remainingBudget = totalBudget - spentBudget;
  if (remainingBudget <= 0) return { allocations: {}, reason: 'budget_exhausted' };
  const settings = allocationSettings(config);
  const minimum = ensureMinimumReplicas(arms, settings.minReplicas);
  if (minimum) return minimum;
  return allocateByThompson({ arms, settings });
}

function allocationSettings(config) {
  return { minReplicas: config.minReplicasPerArm || MIN_REPLICAS_PER_ARM,
    maxReplicas: config.maxReplicasPerArm || MAX_REPLICAS_PER_ARM,
    infoGainThreshold: config.infoGainThreshold || DEFAULT_INFO_GAIN_THRESHOLD,
    seed: config.seed };
}

function ensureMinimumReplicas(arms, minReplicas) {
  for (const arm of arms) {
    if (arm.pulls < minReplicas) return { allocations: { [arm.id]: 1 }, reason: 'minimum_replicas' };
  }
  return null;
}

function allocateByThompson(input) {
  const { arms, settings } = input;
  const rng = settings.seed ? mulberry32(hashString(settings.seed)) : Math.random;
  const bestArm = thompsonSample(arms, rng);
  const infoGain = uncertaintyInformationGain(arms);
  if (belowGainThreshold({ arms, infoGain, settings })) {
    return { allocations: {}, reason: 'information_gain_below_threshold', infoGain };
  }
  return allocateArmOrExplore({ arms, bestArm, maxReplicas: settings.maxReplicas, infoGain });
}

function belowGainThreshold(input) {
  const { arms, infoGain, settings } = input;
  return infoGain < settings.infoGainThreshold && arms.every((arm) => arm.pulls >= settings.minReplicas);
}

function allocateArmOrExplore(input) {
  const { arms, bestArm, maxReplicas, infoGain } = input;
  if (bestArm.pulls >= maxReplicas) {
    const eligible = arms.filter((arm) => arm.pulls < maxReplicas);
    if (!eligible.length) return { allocations: {}, reason: 'max_replicas_reached' };
    return { allocations: { [eligible[0].id]: 1 }, reason: 'best_at_max_explore_others' };
  }
  return { allocations: { [bestArm.id]: 1 }, reason: 'thompson_sampling', infoGain, selectedArm: bestArm.id };
}

function uncertaintyInformationGain(arms) {
  const prior = priorRewards(arms);
  return computeInformationGain(prior, posteriorRewards(arms, prior));
}

function priorRewards(arms) {
  return arms.reduce((acc, arm) => { acc[arm.id] = arm.meanReward || 0.5; return acc; }, {});
}

function posteriorRewards(arms, prior) {
  const posterior = {};
  for (const arm of arms) {
    const mean = prior[arm.id] || 0.5;
    const uncertainty = Math.sqrt(mean * (1 - mean) / (arm.pulls + 1));
    posterior[arm.id] = mean * (1 + uncertainty);
  }
  return posterior;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function initializeArms(worldConfigs) {
  return worldConfigs.map((wc, i) => ({
    id: wc.id || `world_${i + 1}`,
    worldConfig: wc,
    alpha: 1, beta: 1,
    pulls: 0,
    meanReward: 0.5,
    totalReward: 0
  }));
}

function computeBiasCorrectedEstimate(arms) {
  const totalPulls = arms.reduce((s, a) => s + a.pulls, 0);
  let weightedSum = 0, weightSum = 0;
  for (const arm of arms) {
    if (arm.pulls === 0) continue;
    const weight = inverseProbabilityWeight(arm, arms);
    weightedSum += arm.meanReward * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? weightedSum / weightSum : null;
}

function stoppingRule(arms, config) {
  const maxPulls = config.maxTotalReplicas || arms.length * (config.maxReplicasPerArm || MAX_REPLICAS_PER_ARM);
  const totalPulls = arms.reduce((s, a) => s + a.pulls, 0);
  if (totalPulls >= maxPulls) return { stop: true, reason: 'max_total_replicas' };
  const minUncertainty = config.minUncertainty || 0.05;
  const allCertain = arms.every(a => a.pulls > 0 && Math.sqrt(a.meanReward * (1 - a.meanReward) / a.pulls) < minUncertainty);
  if (allCertain) return { stop: true, reason: 'sufficient_certainty' };
  return { stop: false };
}

async function runAdaptiveSequentialTrinity(input) {
  const { mission, worldConfigs, config = {}, db, orchestratorId } = input;
  const arms = initializeArms(worldConfigs);
  const totalBudget = config.totalBudget || worldConfigs.length;
  let spentBudget = 0;
  const results = [];
  const maxRounds = config.maxRounds || 10;
  for (let round = 0; round < maxRounds; round++) {
    const stopCheck = stoppingRule(arms, config);
    if (stopCheck.stop) break;
    const allocation = sequentialAllocate({ arms, totalBudget, spentBudget, config });
    if (!Object.keys(allocation.allocations).length) break;
    for (const [armId, count] of Object.entries(allocation.allocations)) {
      const arm = arms.find(a => a.id === armId);
      for (let r = 0; r < count; r++) {
        const result = await executeWorld(arm.worldConfig, mission, db);
        const reward = extractReward(result);
        updateArm(arm, reward);
        spentBudget += 1;
        results.push({ armId, round, result, reward, allocationReason: allocation.reason });
      }
    }
  }
  const biasCorrected = computeBiasCorrectedEstimate(arms);
  return {
    experimentalDesignId: `adaptive_seq-v1-${crypto.randomBytes(8).toString('hex')}`,
    arms: arms.map(a => ({ id: a.id, pulls: a.pulls, meanReward: a.meanReward, alpha: a.alpha, beta: a.beta })),
    totalPulls: arms.reduce((s, a) => s + a.pulls, 0),
    spentBudget,
    biasCorrectedEstimate: biasCorrected,
    results,
    stoppingReason: stoppingRule(arms, config).reason
  };
}

async function executeWorld(worldConfig, mission, db) {
  return { evidenceVector: { correctness: 0.7 + Math.random() * 0.2, uncertainty: 0.2 + Math.random() * 0.3 } };
}

function extractReward(result) {
  const vec = result.evidenceVector || {};
  return Math.max(0, Math.min(1, (vec.correctness || 0.5) * 0.5 + (1 - (vec.uncertainty || 0.5)) * 0.5));
}

module.exports = { runAdaptiveSequentialTrinity, initializeArms, sequentialAllocate, computeBiasCorrectedEstimate, stoppingRule, thompsonSample, inverseProbabilityWeight };