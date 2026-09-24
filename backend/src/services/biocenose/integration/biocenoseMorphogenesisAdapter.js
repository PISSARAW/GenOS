'use strict';

function recommend(input) {
  if (input.currentTopology !== 'biocenose') return null;
  if (input.normativeDisagreement) return handoff('human', 'NORMATIVE_DISAGREEMENT');
  if (input.deterministicResolutionComplete) return handoff('direct', 'DETERMINISTIC_RESOLUTION');
  if (input.testableDisagreement) return topology('trinity', 'TESTABLE_DISAGREEMENT');
  if (input.judgmentSettled && input.executionNeeded) return topology('a_team', 'EXECUTION_BEGINS');
  return null;
}

function signalsFromJudgment(value) {
  const judgment = value && (value.judgment || value);
  if (!judgment || typeof judgment !== 'object') return {};
  const aggregation = judgment.aggregation || {};
  const status = judgment.status;
  return {
    normativeDisagreement: status === 'HUMAN_REVIEW_REQUIRED'
      || aggregation.humanJudgmentRequired === true,
    deterministicResolutionComplete: aggregation.outcome === 'EVIDENCE_SUPPORTED',
    testableDisagreement: aggregation.outcome === 'ESCALATE_EXPERIMENT'
      || aggregation.experimentRequired === true,
    judgmentSettled: status === 'DECIDED'
  };
}

function topology(target, reason) {
  return { kind: 'TOPOLOGY_TRANSITION', target, reason, requiresMorphogenesisPlan: true };
}

function handoff(destination, reason) {
  return { kind: 'HANDOFF_RECOMMENDATION', destination, reason, requiresMorphogenesisPlan: false };
}

module.exports = { recommend, signalsFromJudgment };
