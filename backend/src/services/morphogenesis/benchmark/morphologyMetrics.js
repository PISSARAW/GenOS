'use strict';

function safeRatio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : 0;
}

function metric(input, key) {
  const value = Number(input[key]);
  return Number.isFinite(value) ? value : 0;
}

function calculateMorphologicalEfficiency(input = {}) {
  const verifiedProgress = Number(input.verifiedUsefulProgress) || 0;
  const costs = ['compute', 'communication', 'coordination', 'transitionCost']
    .reduce((sum, key) => sum + Math.max(0, Number(input[key]) || 0), 0);
  return safeRatio(verifiedProgress, costs);
}

function calculateLocalRepairRatio(input = {}) {
  return safeRatio(Number(input.localRepairs) || 0, Number(input.allRepairs) || 0);
}

function calculateTopologyNecessityPrecision(values = []) {
  const instantiated = values.filter((item) => item && item.instantiated);
  const useful = instantiated.filter((item) => Number.isFinite(item.marginalValue) && item.marginalValue > 0);
  return safeRatio(useful.length, instantiated.length);
}

function missionRegret(stages = []) {
  const regrets = stages.map((stage) => Math.max(0, (Number(stage.idealUtility) || 0) - (Number(stage.utility) || 0)));
  return { perStage: regrets, total: regrets.reduce((sum, regret) => sum + regret, 0) };
}

function summarizeMorphologyMetrics(input = {}) {
  const transitions = metric(input, 'transitionCount');
  return {
    successRate: safeRatio(metric(input, 'successes'), metric(input, 'missions')),
    qualityPerToken: safeRatio(metric(input, 'quality'), metric(input, 'tokens')),
    qualityPerEuro: safeRatio(metric(input, 'quality'), metric(input, 'euros')),
    adaptationLatency: metric(input, 'adaptationLatency'),
    transitionCount: transitions,
    unnecessaryTransitionRate: safeRatio(metric(input, 'unnecessaryTransitions'), transitions),
    workerReuseRate: safeRatio(metric(input, 'reusedWorkers'), metric(input, 'workersConsidered')),
    stateMigrationLoss: metric(input, 'stateMigrationLoss'),
    communicationWaste: metric(input, 'communicationWaste'),
    coordinationOverhead: metric(input, 'coordinationOverhead'),
    errorPropagation: metric(input, 'errorPropagation'),
    failureContainment: metric(input, 'failuresContained'),
    recoveryTime: metric(input, 'recoveryTime'),
    morphologyComplexity: metric(input, 'morphologyComplexity'),
    counterfactualPredictionAccuracy: metric(input, 'counterfactualPredictionAccuracy'),
    morphologicalEfficiency: calculateMorphologicalEfficiency(input),
    localRepairRatio: calculateLocalRepairRatio(input),
    topologyNecessityPrecision: calculateTopologyNecessityPrecision(Array.isArray(input.topologies) ? input.topologies : []),
    missionRegret: missionRegret(Array.isArray(input.stages) ? input.stages : []).total
  };
}

module.exports = { calculateLocalRepairRatio, calculateMorphologicalEfficiency, calculateTopologyNecessityPrecision, missionRegret, summarizeMorphologyMetrics };
