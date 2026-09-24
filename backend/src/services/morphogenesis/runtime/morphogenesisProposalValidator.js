'use strict';

const { validateMorphologyGraph } = require('../graph/morphologyGraphValidator');
const { validateMorphologyPatch } = require('../transitions/morphologyPatch');

function noChangeErrors(plan) {
  const errors = [];
  if (!plan.reason) errors.push('NO_CHANGE requires a reason');
  if (!Array.isArray(plan.evidence)) errors.push('NO_CHANGE requires evidence');
  if (!Number.isFinite(plan.expectedGainOfBestAlternative)) errors.push('NO_CHANGE requires alternative gain estimate');
  return errors;
}

function changeErrors(plan) {
  const errors = [];
  if (plan.graph) errors.push(...validateMorphologyGraph(plan.graph).errors);
  if (plan.patch) errors.push(...validateMorphologyPatch(plan.patch).errors);
  if (!plan.graph && !plan.patch && !['PARAMETER_UPDATE', 'COMMUNICATION_UPDATE', 'BUDGET_UPDATE', 'WORKER_REBIND', 'LOCAL_MUTATION'].includes(plan.kind)) {
    errors.push('a valid graph, patch or supported local update is required');
  }
  if (!plan.rollbackPlan) errors.push('rollback plan is required');
  return errors;
}

function validateMorphogenesisProposal(plan = {}) {
  const errors = plan.decision === 'NO_CHANGE' ? noChangeErrors(plan) : changeErrors(plan);
  const cost = plan.transitionCost ?? (plan.expectedCost && plan.expectedCost.tokens) ?? 0;
  if (!Number.isFinite(cost) || cost < 0) errors.push('transition cost must be non-negative');
  return { valid: errors.length === 0, errors, decision: plan.decision === 'NO_CHANGE' ? 'NO_CHANGE' : 'APPLY' };
}

module.exports = { validateMorphogenesisProposal };
