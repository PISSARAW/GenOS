'use strict';

const { createSyncytiumCrdt } = require('../../syncytiumCrdtService');

function simulate(session, request) {
  const history = session.crdt.getHistory();
  const target = history.find((operation) => operation.opId === request.opId);
  if (!target) throw missingOperationError(session, request.opId);
  const operations = history.filter((operation) => operation.opId !== request.opId);
  if (request.alternative) operations.push(replacement(target, request.alternative));
  const candidate = replay(operations);
  return {
    opId: request.opId,
    mode: request.alternative ? 'REPLACED' : 'OMITTED',
    original: session.crdt.getSnapshot(),
    simulated: candidate.getSnapshot(),
    changedFields: changedFields(session.crdt.getSnapshot().sharedFields, candidate.getSnapshot().sharedFields)
  };
}

function replacement(original, alternative) {
  if (!alternative || typeof alternative !== 'object' || !alternative.kind || typeof alternative.kind !== 'object') {
    throw Object.assign(new Error('A counterfactual replacement requires an operation kind.'), { code: 'SYNCYTIUM_COUNTERFACTUAL_INVALID' });
  }
  return {
    ...original,
    ...alternative,
    opId: original.opId,
    actorId: original.actorId,
    dot: original.dot,
    causalContext: original.causalContext,
    versionVector: original.versionVector
  };
}

function missingOperationError(session, opId) {
  const compacted = session.crdt.hasOpId(opId);
  return Object.assign(new Error(`Operation '${opId}' is ${compacted ? 'compacted' : 'unknown'}.`), {
    code: compacted ? 'SYNCYTIUM_HISTORY_COMPACTED' : 'SYNCYTIUM_OPERATION_UNKNOWN'
  });
}

function replay(operations) {
  const candidate = createSyncytiumCrdt();
  for (const operation of operations) candidate.applyOp(operation);
  return candidate;
}

function changedFields(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}

module.exports = { simulate };
