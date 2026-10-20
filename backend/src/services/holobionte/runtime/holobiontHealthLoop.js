'use strict';

const contributions = require('../fitness/symbiontContributionService');
const fitnessVectors = require('../fitness/holobiontFitnessVectorService');
const dysbiosisDetector = require('../health/dysbiosisDetector');
const measurements = require('../health/holobiontMeasurements');
const classifier = require('../health/symbiontFailureClassifier');

function asSignalObject(value, status) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { value: value.value ?? value.measuredValue ?? value.score, status: value.status ?? status };
  }
  return { value, status };
}

function annotateSignals(signals, status) {
  const result = {};
  for (const [name, value] of Object.entries(signals || {})) {
    result[name] = asSignalObject(value, status);
  }
  return result;
}

async function healthMeasurements(db, input) {
  const result = {};
  if (input.fitnessVector) result.fitnessVector = fitnessVectors.buildFitnessVector(input.fitnessVector);
  const supplied = Boolean(input.dysbiosisSignals);
  const rawSignals = supplied
    ? input.dysbiosisSignals
    : await measurements.deriveDysbiosisSignals(db, input.holobiontId);
  const signals = annotateSignals(rawSignals, 'heuristic');
  const thresholds = input.healthPolicy?.dysbiosisThresholds;
  result.dysbiosis = dysbiosisDetector.detectDysbiosis(signals, thresholds);
  result.measurementSource = supplied ? 'supplied' : 'persisted-ledger';
  result.status = result.dysbiosis.measurementStatus;
  result.measurementStatus = result.dysbiosis.measurementStatus;
  result.promotionEligible = false;
  return result;
}

async function assess(db, input = {}) {
  const ledger = await contributions.relationshipLedger(db, input.holobiontId, input.symbiontId);
  const fitness = contributions.relationshipFitness(ledger);
  const refs = ledger.flatMap((item) => item.evidenceRefs || []);
  const measured = await healthMeasurements(db, input);
  if (!refs.length) return { fitness, failure: null, nextAction: null, automaticActionApplied: false, ...measured };
  const failure = classifier.classifySymbiontFailure({
    symbiontId: input.symbiontId, evidenceRefs: refs,
    pathobiotic: ['PATHOBIOTIC', 'HARMFUL'].includes(fitness.classification),
    contributionScore: fitness.meanContribution,
    failureRate: Math.min(1, fitness.failures / Math.max(1, fitness.count)),
    resourcePressure: input.resourcePressure ?? 0, dependencyScore: input.dependencyScore ?? 0,
    falseAlertRate: input.falseAlertRate ?? Math.min(1, fitness.falseAlerts / Math.max(1, fitness.count))
  });
  return { fitness, failure, verifierId: ledger.at(-1).verifierId,
    nextAction: failure.classified ? failure.recommendedActions[0] : null,
    automaticActionApplied: false, ...measured };
}

module.exports = { assess };
