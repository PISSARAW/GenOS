'use strict';

const HARD_CONSTRAINTS = Object.freeze(['authority', 'budget', 'safety', 'privacy']);

function evaluateConstraintGate(constraints = {}) {
  const errors = [];
  for (const constraint of HARD_CONSTRAINTS) {
    if (!constraints || constraints[constraint] !== true) errors.push(`hard constraint failed or unverified: ${constraint}`);
  }
  return { passed: errors.length === 0, errors };
}

module.exports = { HARD_CONSTRAINTS, evaluateConstraintGate };
