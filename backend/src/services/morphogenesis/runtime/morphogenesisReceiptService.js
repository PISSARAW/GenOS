'use strict';

const REQUIRED_FIELDS = Object.freeze([
  'scope', 'change', 'evidence', 'expectedGain', 'transitionCost', 'counterfactual', 'rollback'
]);

function createMorphogenesisReceipt(input = {}) {
  const missing = REQUIRED_FIELDS.filter((field) => input[field] === undefined);
  if (missing.length) throw new Error(`receipt missing fields: ${missing.join(', ')}`);
  return {
    kind: 'MORPHOGENESIS_RECEIPT', scope: input.scope, change: input.change,
    evidence: input.evidence, expectedGain: input.expectedGain,
    transitionCost: input.transitionCost, counterfactual: input.counterfactual,
    rollback: input.rollback, decisionId: input.decisionId || null,
    createdAt: input.createdAt || new Date().toISOString()
  };
}

module.exports = { REQUIRED_FIELDS, createMorphogenesisReceipt };
