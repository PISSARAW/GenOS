'use strict';

const { ARMS } = require('./longitudinalBenchmarkServiceConstants');
const { invalid, text, validateRun } = require('./longitudinalRunValidation');
const campaignRunner = require('./longitudinalCampaignExecutionService');

function sumMetric(runs, name) {
  return runs.reduce((total, run) => total + (run.metrics[name] || 0), 0);
}

function meanMetric(runs, name) {
  const values = runs.map((run) => run.metrics[name]).filter((value) => value !== undefined);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function symbiosisMetrics(runs) {
  return {
    residentReuseRate: ratio(sumMetric(runs, 'residentCapabilitiesReused'), sumMetric(runs, 'capabilityNeeds')),
    unsafeAdmissionRate: ratio(sumMetric(runs, 'harmfulAdmissions'), sumMetric(runs, 'admissions')),
    immuneFalsePositiveRate: ratio(sumMetric(runs, 'immuneFalsePositives'), sumMetric(runs, 'verifiedSafeBlocks')),
    immuneFalseNegativeRate: ratio(sumMetric(runs, 'immuneFalseNegatives'), sumMetric(runs, 'verifiedUnsafeAllows')),
    replacementTimeSeconds: meanMetric(runs, 'replacementTimeSeconds'),
    dependencyConcentration: meanMetric(runs, 'dependencyConcentration'),
    functionalRedundancy: meanMetric(runs, 'functionalRedundancy'),
    verticalRetentionRate: ratio(sumMetric(runs, 'retainedSymbionts'), sumMetric(runs, 'inheritableSymbionts')),
    dysbiosisEvents: sumMetric(runs, 'dysbiosisEvents'),
    recoveryTimeSeconds: meanMetric(runs, 'recoveryTimeSeconds')
  };
}

function summarizeArm(runs) {
  return {
    missionCount: runs.length,
    taskSuccessRate: runs.filter((run) => run.success).length / runs.length,
    meanCost: runs.reduce((sum, run) => sum + run.cost, 0) / runs.length,
    meanTokens: runs.reduce((sum, run) => sum + run.tokens, 0) / runs.length,
    symbiosis: symbiosisMetrics(runs),
    evidenceRefs: [...new Set(runs.flatMap((run) => run.evidenceRefs))]
  };
}

function validateArms(input) {
  const arms = input.arms || {};
  const normalized = {};
  for (const arm of ARMS) {
    if (!Array.isArray(arms[arm])) throw invalid(`Missing benchmark arm: ${arm}.`);
    normalized[arm] = arms[arm].map((run) => validateRun(run, arm));
  }
  const missionIds = normalized[ARMS[0]].map((run) => run.missionId);
  if (missionIds.length < 50 || missionIds.length > 100 || new Set(missionIds).size !== missionIds.length) {
    throw invalid('Each arm must cover 50 to 100 distinct sequential missions.');
  }
  for (const arm of ARMS.slice(1)) {
    const ids = normalized[arm].map((run) => run.missionId);
    if (ids.length !== missionIds.length || ids.some((id, index) => id !== missionIds[index])) {
      throw invalid(`Arm ${arm} must use the same ordered missions.`);
    }
  }
  return { missionIds, normalized };
}

function evaluateLongitudinalBenchmark(input = {}) {
  const benchmarkId = text(input.benchmarkId, 'benchmarkId');
  const { missionIds, normalized } = validateArms(input);
  return {
    benchmarkId,
    missionCount: missionIds.length,
    arms: Object.fromEntries(ARMS.map((arm) => [arm, summarizeArm(normalized[arm])])),
    promotionDecision: null
  };
}

function validateCampaign(input) {
  if (typeof input.runMission !== 'function' || !Array.isArray(input.missions)) {
    throw invalid('missions and a runMission function are required.');
  }
  const missionIds = input.missions.map((mission) => text(mission?.id || mission?.missionId, 'mission id'));
  if (missionIds.length < 50 || missionIds.length > 100 || new Set(missionIds).size !== missionIds.length) {
    throw invalid('A campaign requires 50 to 100 distinct sequential missions.');
  }
  return missionIds;
}

async function runLongitudinalBenchmark(input = {}) {
  const missionIds = validateCampaign(input);
  const arms = await campaignRunner.executeRuns({ input, missionIds });
  return evaluateLongitudinalBenchmark({ benchmarkId: input.benchmarkId, arms });
}

module.exports = { ARMS, evaluateLongitudinalBenchmark, runLongitudinalBenchmark };
