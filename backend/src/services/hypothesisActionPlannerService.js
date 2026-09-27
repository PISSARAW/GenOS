'use strict';

function promoteHypothesis(hypothesis, evidence) {
  if (!hypothesis?.id || !Array.isArray(evidence) || evidence.length === 0) throw Object.assign(new Error('Promotion requires hypothesis and evidence'), { code: 'HYPOTHESIS_UNSUPPORTED' });
  return { hypothesisId: hypothesis.id, status: 'promoted', evidenceRefs: evidence.map(String), promotedAt: new Date().toISOString() };
}

function buildPlan(promoted, action) {
  if (!promoted || promoted.status !== 'promoted' || !action?.type) throw Object.assign(new Error('A promoted hypothesis and action are required'), { code: 'PLAN_BLOCKED' });
  return { planId: `plan_${promoted.hypothesisId}`, hypothesisId: promoted.hypothesisId, action: { ...action }, semanticDelta: action.semanticDelta || {}, rollback: { enabled: true, stateBeforeHash: action.stateBeforeHash || null } };
}

function executePlan(plan, observation) {
  const expected = plan?.semanticDelta || {}; const actual = observation?.delta || {};
  const mismatch = Object.keys(expected).filter((key) => JSON.stringify(expected[key]) !== JSON.stringify(actual[key]));
  return { planId: plan?.planId || null, executed: true, mismatch, rollback: mismatch.length > 0, observation: observation || null };
}

module.exports = { promoteHypothesis, buildPlan, executePlan };
