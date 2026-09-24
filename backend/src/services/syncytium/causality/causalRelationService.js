'use strict';

const vectors = require('./versionVectorService');

function relation(left, right) {
  return vectors.compare(versionOf(left), versionOf(right));
}

function happenedBefore(left, right) {
  return relation(left, right) === 'BEFORE';
}

function concurrent(left, right) {
  return relation(left, right) === 'CONCURRENT';
}

function versionOf(operation) {
  if (operation?.versionVector) return operation.versionVector;
  const vector = { ...(operation?.causalContext || {}) };
  const dot = operation?.dot;
  if (dot?.actorId && Number.isSafeInteger(dot.sequence)) vector[dot.actorId] = dot.sequence;
  return vector;
}

module.exports = { relation, happenedBefore, concurrent };
