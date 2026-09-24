'use strict';

const causalRelations = require('../causality/causalRelationService');

function concurrentPair(left, right) {
  return causalRelations.concurrent(left, right);
}

function pathOf(operation) {
  return String(operation?.kind?.key || operation?.target || '').trim();
}

function sameTarget(left, right) {
  if (pathOf(left) !== pathOf(right)) return false;
  const leftEntry = left.kind?.entryKey;
  const rightEntry = right.kind?.entryKey;
  return leftEntry === undefined && rightEntry === undefined ? true : leftEntry === rightEntry;
}

function conflict({ type, left, right, description }) {
  return { type, opIds: [left.opId || null, right.opId || null], target: pathOf(right), description };
}

module.exports = { concurrentPair, pathOf, sameTarget, conflict };
