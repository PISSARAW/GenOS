'use strict';

const contributions = require('../fitness/symbiontContributionService');
const fitnessVectors = require('../fitness/holobiontFitnessVectorService');
const dysbiosisDetector = require('../health/dysbiosisDetector');
const measurements = require('../health/holobiontMeasurements');
const classifier = require('../health/symbiontFailureClassifier');

async function healthMeasurements(db, input) {
  const result = {};
  if (input.fitnessVector) result.fitnessVector = fitnessVectors.buildFitnessVector(input.fitnessVector);
  const signals = input.dysbiosisSignals || await measurements.deriveDysbiosisSignals(db, input.holobiontId);
  result.dysbiosis = dysbiosisDetector.detectDysbiosis(signals);
  result.measurementSource = input.dysbiosisSignals ? 'supplied' : 'persisted-ledger';
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
