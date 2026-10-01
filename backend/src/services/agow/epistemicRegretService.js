'use strict';

function bounded(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function descendantMultiplier(candidate) {
  const count = Math.max(0, Math.floor(Number(candidate.epistemicContext?.causalDescendantCount) || 0));
  return Math.min(2, 1 + Math.log1p(count) * 0.25);
}

function beliefImportance(candidate) {
  return bounded(candidate.epistemicContext?.beliefImportance ?? candidate.measures.goalRelevance);
}

function probabilityOfError(candidate) {
  const measures = candidate.measures;
  return bounded(measures.uncertainty * 0.35 + measures.predictionError * 0.25
    + measures.evidenceDebt * 0.25 + (1 - measures.causalConfidence) * 0.15);
}

function evaluate(candidate) {
  const risk = probabilityOfError(candidate) * (0.5 + beliefImportance(candidate)) * descendantMultiplier(candidate);
  const expectedLossIfIgnored = bounded(risk);
  const expectedLossIfAttended = bounded(candidate.measures.evidenceDebt * (1 - candidate.measures.actionability) * 0.15);
  return {
    expectedLossIfIgnored, expectedLossIfAttended,
    regret: bounded(expectedLossIfIgnored - expectedLossIfAttended),
    confidence: bounded((1 - candidate.measures.uncertainty + candidate.measures.causalConfidence) / 2),
    provenance: {
      method: 'candidate_epistemic_signals_v1', candidateId: candidate.candidateId,
      evidenceRefs: [...candidate.evidenceRefs], calibrated: false
    }
  };
}

module.exports = { evaluate, probabilityOfError, beliefImportance, descendantMultiplier };
