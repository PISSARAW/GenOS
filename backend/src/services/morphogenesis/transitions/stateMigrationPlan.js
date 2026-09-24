'use strict';

const DISPOSITIONS = Object.freeze(['preserve', 'translate', 'archive', 'discard']);

function validateActions(plan) {
  const errors = [];
  for (const disposition of DISPOSITIONS) {
    if (!Array.isArray(plan && plan[disposition])) errors.push(`${disposition} must be an action list`);
  }
  if (Array.isArray(plan && plan.translate)) {
    for (const action of plan.translate) {
      if (!action.source || !action.target) errors.push('translated state requires source and target selectors');
    }
  }
  return errors;
}

function createStateMigrationPlan(input = {}) {
  const plan = Object.fromEntries(DISPOSITIONS.map((key) => [key, Array.isArray(input[key]) ? [...input[key]] : null]));
  const errors = validateActions(plan);
  if (errors.length) throw new Error(`Invalid state migration plan: ${errors.join('; ')}`);
  return plan;
}

module.exports = { DISPOSITIONS, createStateMigrationPlan, validateActions };
