'use strict';

const evaluator = require('./invariantEvaluator');
const dependencyIndex = require('./invariantDependencyIndex');

function evaluateCandidate({ schema, crdt, operation }) {
  const registry = schema?.invariants || {};
  const affectedIds = dependencyIndex.affected(schema?.invariantIndex, operation?.kind?.key || '');
  if (!affectedIds.length) return [];
  const affected = Object.fromEntries(affectedIds.map((id) => [id, registry[id]]).filter(([, invariant]) => invariant));
  const candidate = crdt.fork();
  candidate.applyOp(operation);
  const receipts = evaluator.evaluateAll(affected, candidate.getSnapshot().sharedFields);
  const violations = receipts.filter((receipt) => !receipt.passed && receipt.severity !== 'WARNING');
  if (violations.length) {
    throw Object.assign(new Error('Syncytium operation would violate a blocking invariant.'), {
      code: 'SYNCYTIUM_INVARIANT_VIOLATION', violations
    });
  }
  return receipts;
}

module.exports = { evaluateCandidate };
