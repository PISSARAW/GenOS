'use strict';

const { createSyncytiumCrdt } = require('../../syncytiumCrdtService');
const evaluator = require('./invariantEvaluator');

function evaluateCandidate({ schema, crdt, operation }) {
  const registry = schema?.invariants || {};
  if (!Object.keys(registry).length) return [];
  const candidate = createSyncytiumCrdt();
  crdt.getHistory().forEach((item) => candidate.applyOp(item));
  candidate.applyOp(operation);
  const receipts = evaluator.evaluateAll(registry, candidate.getSnapshot().sharedFields);
  const violations = receipts.filter((receipt) => !receipt.passed && receipt.severity !== 'WARNING');
  if (violations.length) {
    throw Object.assign(new Error('Syncytium operation would violate a blocking invariant.'), {
      code: 'SYNCYTIUM_INVARIANT_VIOLATION', violations
    });
  }
  return receipts;
}

module.exports = { evaluateCandidate };
