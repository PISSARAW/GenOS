'use strict';

const ARMS = Object.freeze([
  'singleLlm', 'singleLlmTools', 'supervisorWorkers', 'aTeam',
  'currentFourRoleHolobiont', 'staticResidentTools',
  'persistentHostWithoutPartnerLearning', 'withoutImmuneAdmission',
  'withoutResourceAdaptation', 'withoutTransmission',
  'withoutDependencyControl', 'fullHolobiont'
]);
const METRICS = Object.freeze([
  'capabilityNeeds', 'residentCapabilitiesReused', 'admissions', 'harmfulAdmissions',
  'immuneFalsePositives', 'verifiedSafeBlocks', 'immuneFalseNegatives',
  'verifiedUnsafeAllows', 'replacementTimeSeconds', 'dependencyConcentration',
  'functionalRedundancy', 'inheritableSymbionts', 'retainedSymbionts',
  'dysbiosisEvents', 'recoveryTimeSeconds'
]);

function invalid(message, code = 'HOLOBIONT_BENCHMARK_INVALID') {
  return Object.assign(new Error(message), { code });
}

function text(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw invalid(`${field} is required.`);
  return normalized;
}

function nonNegative(value, field, allowNull = false) {
  if (allowNull && value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw invalid(`${field} must be non-negative.`);
  return number;
}

function fraction(value, field) {
  const number = nonNegative(value, field);
  if (number > 1) throw invalid(`${field} must be between 0 and 1.`);
  return number;
}

function validateMetrics(metrics = {}) {
  const result = {};
  for (const key of METRICS) {
    const value = nonNegative(metrics[key], key, true);
    if (value !== null) result[key] = ['dependencyConcentration', 'functionalRedundancy'].includes(key)
      ? fraction(value, key) : value;
  }
  return result;
}

function validateRun(run, arm) {
  if (!run || typeof run !== 'object' || typeof run.success !== 'boolean') {
    throw invalid(`${arm} contains a malformed run.`);
  }
  const evidenceRefs = Array.isArray(run.evidenceRefs) ? run.evidenceRefs.map((ref) => String(ref).trim()).filter(Boolean) : [];
  if (!evidenceRefs.length) throw invalid(`${arm} requires run evidence.`, 'HOLOBIONT_EVIDENCE_REQUIRED');
  return {
    missionId: text(run.missionId, 'missionId'), success: run.success,
    cost: nonNegative(run.cost, 'cost'), tokens: nonNegative(run.tokens, 'tokens'),
    evidenceRefs, verifierId: text(run.verifierId, 'verifierId'), metrics: validateMetrics(run.metrics)
  };
}

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
  const arms = {};
  for (const arm of ARMS) {
    arms[arm] = [];
    for (let index = 0; index < input.missions.length; index += 1) {
      const mission = input.missions[index];
      const result = await input.runMission({ arm, mission, sequence: index });
      if (result?.missionId && result.missionId !== missionIds[index]) {
        throw invalid(`Runner returned an out-of-sequence mission for ${arm}.`);
      }
      arms[arm].push({ ...result, missionId: missionIds[index] });
    }
  }
  return evaluateLongitudinalBenchmark({ benchmarkId: input.benchmarkId, arms });
}

module.exports = { ARMS, evaluateLongitudinalBenchmark, runLongitudinalBenchmark };
