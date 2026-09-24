'use strict';

const contributions = require('../fitness/symbiontContributionService');
const classifier = require('../health/symbiontFailureClassifier');

async function assess(db, input = {}) {
  const ledger = await contributions.relationshipLedger(db, input.holobiontId, input.symbiontId);
  const fitness = contributions.relationshipFitness(ledger);
  const refs = ledger.flatMap((item) => item.evidenceRefs || []);
  if (!refs.length) return { fitness, failure: null, nextAction: null };
  const failure = classifier.classifySymbiontFailure({
    symbiontId: input.symbiontId, evidenceRefs: refs,
    pathobiotic: ['PATHOBIOTIC', 'HARMFUL'].includes(fitness.classification),
    contributionScore: fitness.meanContribution,
    resourcePressure: input.resourcePressure || 0,
    dependencyScore: input.dependencyScore || 0,
    falseAlertRate: input.falseAlertRate || 0
  });
  return {
    fitness, failure,
    nextAction: failure.classified ? failure.recommendedActions[0] : null,
    automaticActionApplied: false
  };
}

module.exports = { assess };
