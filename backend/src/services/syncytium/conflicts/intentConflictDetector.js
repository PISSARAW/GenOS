'use strict';

const utils = require('./conflictUtils');

function detect({ operation, history }) {
  const conflicts = [];
  for (const prior of history) {
    if (!utils.concurrentPair(prior, operation) || !intentsDisagree(prior.intent, operation.intent)) continue;
    conflicts.push(utils.conflict({ type: 'INTENT_CONFLICT', left: prior, right: operation, description: 'Concurrent operations declare incompatible goals or effects.' }));
  }
  return conflicts;
}

function intentsDisagree(left = {}, right = {}) {
  const explicitConflict = list(left.conflictsWith).includes(right.goalId)
    || list(right.conflictsWith).includes(left.goalId);
  const sameGoalDifferentEffect = left.goalId && left.goalId === right.goalId
    && JSON.stringify(left.expectedEffect) !== JSON.stringify(right.expectedEffect);
  return explicitConflict || sameGoalDifferentEffect;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = { detect };
