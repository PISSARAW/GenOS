'use strict';

const epistemicRegret = require('./epistemicRegretService');
const allostaticRegret = require('./allostaticRegretAdapter');

const WEIGHTS = Object.freeze({ goal: 0.3, epistemic: 0.3, viability: 0.2, integrity: 0.1, opportunity: 0.1 });

function bounded(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizedCost(candidate) {
  const cost = Math.max(0, Number(candidate.measures.estimatedCost) || 0);
  return cost / (1 + cost);
}

function lossesFor(candidate, epistemic, viability) {
  const measures = candidate.measures;
  const integrityReview = candidate.constraints.integrity === 'review' ? 0.5 : 0;
  return {
    attend: {
      expectedGoalLoss: bounded(normalizedCost(candidate) * measures.goalRelevance * 0.25),
      expectedEpistemicLoss: epistemic.expectedLossIfAttended,
      expectedViabilityLoss: viability.expectedLossIfAttended,
      expectedIntegrityLoss: bounded(measures.evidenceDebt * measures.actionability * 0.2),
      expectedOpportunityLoss: bounded(normalizedCost(candidate) * (1 - measures.novelty) * 0.1)
    },
    ignore: {
      expectedGoalLoss: bounded(measures.goalRelevance * (0.2 + measures.actionability * 0.5) * (0.5 + measures.urgency * 0.5)),
      expectedEpistemicLoss: epistemic.expectedLossIfIgnored,
      expectedViabilityLoss: viability.expectedLossIfIgnored,
      expectedIntegrityLoss: bounded(integrityReview + measures.predictionError * measures.goalRelevance * 0.25),
      expectedOpportunityLoss: bounded(measures.expectedInformationGain * (0.5 + measures.novelty * 0.5))
    }
  };
}

function categoryRegrets(losses) {
  return Object.fromEntries(Object.keys(losses.attend).map((key) => [
    key.replace('expected', '').replace('Loss', '').toLowerCase(),
    bounded(losses.ignore[key] - losses.attend[key])
  ]));
}

function aggregate(regret) {
  return bounded(regret.goal * WEIGHTS.goal + regret.epistemic * WEIGHTS.epistemic
    + regret.viability * WEIGHTS.viability + regret.integrity * WEIGHTS.integrity
    + regret.opportunity * WEIGHTS.opportunity);
}

function evaluate(candidate, context = {}) {
  const epistemic = epistemicRegret.evaluate(candidate);
  const viability = allostaticRegret.evaluate(candidate, context);
  const losses = lossesFor(candidate, epistemic, viability);
  const regret = categoryRegrets(losses);
  regret.aggregate = aggregate(regret);
  return {
    candidateId: candidate.candidateId, attend: losses.attend, ignore: losses.ignore,
    regret, confidence: bounded((epistemic.confidence + viability.confidence) / (viability.available ? 2 : 1)),
    provenance: { method: 'predictive_regret_v1', calibrated: false, epistemic: epistemic.provenance,
      allostasisAvailable: viability.available }, preempt: viability.preempt
  };
}

module.exports = { evaluate, WEIGHTS };
