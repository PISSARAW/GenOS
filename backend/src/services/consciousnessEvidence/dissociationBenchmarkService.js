'use strict';

const registry = require('../../../../shared/consciousnessDissociationRegistry.json');
const experiments = require('./experimentRegistryService');
const claimBoundary = require('./claimBoundaryService');

const INPUT_SCHEMA = 'genos.consciousness-dissociation-suite/v1';
const RESULT_SCHEMA = 'genos.consciousness-dissociation-result/v1';
const REPORT_KEYS = new Set(['reportText', 'textClaims', 'selfReport', 'qualia']);
const VECTOR_KEYS = Object.freeze([
  'stimulusPresent', 'aboveChancePerformance', 'reportAvailable', 'internallyGeneratedContent'
]);

function reject(message) {
  const error = new TypeError(message);
  error.code = 'CONSCIOUSNESS_DISSOCIATION_INVALID';
  throw error;
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) reject(`${name} must be a non-empty string.`);
}

function rejectReportText(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (REPORT_KEYS.has(key)) reject(`Report text field '${key}' is forbidden.`);
    rejectReportText(item);
  }
}

function validateRegistry() {
  if (registry.schema !== 'genos.consciousness-dissociation-registry/v1') reject('Unknown dissociation registry schema.');
  if (registry.experimentRegistrySchema !== 'genos.consciousness-experiment-registry/v1') reject('Experiment registry mismatch.');
  if (registry.constraints.phenomenalInferenceAllowed || registry.constraints.promotionAllowed) reject('Unsafe registry constraints.');
  const ids = registry.scenarios.map((scenario) => scenario.id);
  if (new Set(ids).size !== ids.length) reject('Duplicate dissociation scenario ID.');
  for (const scenario of registry.scenarios) {
    scenario.hypothesisIds.forEach((id) => experiments.findHypothesis(id));
  }
  return true;
}

function getRegistry() {
  validateRegistry();
  return structuredClone(registry);
}

function validateLocks(locks) {
  requireText(locks?.model, 'locks.model');
  requireText(locks?.toolset, 'locks.toolset');
  if (!Number.isFinite(locks?.budget) || locks.budget <= 0) reject('locks.budget must be positive.');
}

function validateMeasures(measures) {
  if (!measures || typeof measures !== 'object') reject('measures are required.');
  for (const key of ['stimulusPresent', 'reportAvailable', 'internallyGeneratedContent']) {
    if (typeof measures[key] !== 'boolean') reject(`measures.${key} must be boolean.`);
  }
  if (!Number.isFinite(measures.taskPerformance) || measures.taskPerformance < 0
    || measures.taskPerformance > 1) reject('taskPerformance must be between zero and one.');
}

function validateObservation(observation) {
  requireText(observation?.scenarioId, 'scenarioId');
  requireText(observation?.runId, 'runId');
  if (!Number.isInteger(observation.seed) || observation.seed < 0) reject('seed must be a non-negative integer.');
  validateLocks(observation.locks);
  validateMeasures(observation.measures);
  if (!Array.isArray(observation.evidenceRefs) || observation.evidenceRefs.length === 0) reject('evidenceRefs are required.');
  observation.evidenceRefs.forEach((ref) => requireText(ref, 'evidenceRef'));
}

function validateThresholds(thresholds) {
  if (!Number.isFinite(thresholds?.chanceLevel) || thresholds.chanceLevel < 0
    || thresholds.chanceLevel > 1) reject('chanceLevel must be between zero and one.');
  if (!Number.isFinite(thresholds?.minimumAdvantage) || thresholds.minimumAdvantage <= 0) {
    reject('minimumAdvantage must be positive.');
  }
  if (thresholds.chanceLevel + thresholds.minimumAdvantage > 1) reject('Performance threshold cannot exceed one.');
}

function sameLocks(left, right) {
  return left.model === right.model && left.toolset === right.toolset && left.budget === right.budget;
}

function validatePairing(observations) {
  const expectedIds = registry.scenarios.map((scenario) => scenario.id).sort();
  const actualIds = observations.map((item) => item.scenarioId).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) reject('Suite must cover each registered scenario exactly once.');
  const reference = observations[0];
  if (observations.some((item) => item.seed !== reference.seed || !sameLocks(item.locks, reference.locks))) {
    reject('Suite observations must share seed and locks.');
  }
}

function observedVector(observation, thresholds) {
  return {
    stimulusPresent: observation.measures.stimulusPresent,
    aboveChancePerformance: observation.measures.taskPerformance >= thresholds.chanceLevel + thresholds.minimumAdvantage,
    reportAvailable: observation.measures.reportAvailable,
    internallyGeneratedContent: observation.measures.internallyGeneratedContent
  };
}

function assessObservation(observation, thresholds) {
  const scenario = registry.scenarios.find((item) => item.id === observation.scenarioId);
  const observed = observedVector(observation, thresholds);
  const mismatches = VECTOR_KEYS.filter((key) => observed[key] !== scenario.prediction[key]);
  return {
    scenarioId: scenario.id,
    runId: observation.runId,
    observed,
    expected: structuredClone(scenario.prediction),
    matchesPrediction: mismatches.length === 0,
    mismatches,
    evidenceRefs: [...new Set(observation.evidenceRefs)]
  };
}

function dissociationStatus(assessments) {
  const byId = new Map(assessments.map((item) => [item.scenarioId, item]));
  return {
    processingWithoutReport: byId.get('processing-without-report').matchesPrediction,
    reportWithoutCurrentStimulus: byId.get('report-without-current-stimulus').matchesPrediction
  };
}

function assessSuite(input = {}) {
  rejectReportText(input);
  validateRegistry();
  if (input.schema !== INPUT_SCHEMA) reject('Unknown dissociation suite schema.');
  requireText(input.protocolId, 'protocolId');
  requireText(input.revision, 'revision');
  validateThresholds(input.thresholds);
  if (!Array.isArray(input.observations)) reject('observations must be an array.');
  input.observations.forEach(validateObservation);
  validatePairing(input.observations);
  const assessments = input.observations.map((item) => assessObservation(item, input.thresholds));
  return {
    schema: RESULT_SCHEMA,
    protocolId: input.protocolId,
    revision: input.revision,
    seed: input.observations[0].seed,
    locks: structuredClone(input.observations[0].locks),
    thresholds: structuredClone(input.thresholds),
    assessments,
    dissociations: dissociationStatus(assessments),
    status: assessments.every((item) => item.matchesPrediction) ? 'prediction_supported' : 'prediction_not_supported',
    interpretation: 'functional_dissociation_only',
    reportTextUsed: false,
    promotionAllowed: false,
    epistemicBoundary: claimBoundary.boundary()
  };
}

module.exports = { getRegistry, validateRegistry, assessSuite };
