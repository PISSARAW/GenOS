'use strict';

function explain(session, request) {
  const path = String(request.path || '').trim();
  const history = session.crdt.getHistory();
  const relevant = history.filter((operation) => operation.kind?.key === path);
  const target = selectTarget(relevant, request.version);
  if (!target) return { path, currentValue: readCurrent(session, path), operation: null, ancestors: [], compacted: session.crdt.serialize().compactedOpCount > 0 };
  const ancestors = causalAncestors(target, history);
  return {
    path,
    currentValue: readCurrent(session, path),
    operation: describe(target),
    ancestors: ancestors.map(describe),
    compacted: session.crdt.serialize().compactedOpCount > 0
  };
}

function selectTarget(operations, version) {
  if (typeof version === 'string') return findById(operations, version);
  if (version && typeof version === 'object') return findByDot(operations, version);
  if (Number.isSafeInteger(version)) return findBySequence(operations, version);
  return findByTime(operations, version);
}

function findById(operations, opId) {
  return operations.find((operation) => operation.opId === opId) || null;
}

function findByDot(operations, dot) {
  return operations.find((operation) => operation.dot?.actorId === dot.actorId
    && operation.dot?.sequence === dot.sequence) || null;
}

function findBySequence(operations, sequence) {
  return [...operations].reverse().find((operation) => operation.dot?.sequence === sequence) || null;
}

function findByTime(operations, timestampMs) {
  return [...operations].reverse().find((operation) => timestampMs === undefined || operation.timestampMs <= timestampMs) || null;
}

function causalAncestors(target, history) {
  const result = new Map();
  const pending = Object.entries(target.causalContext || {});
  while (pending.length) {
    const [actor, sequence] = pending.pop();
    const ancestor = history.find((operation) => operation.dot?.actorId === actor && operation.dot.sequence === sequence);
    if (!ancestor || ancestor.opId === target.opId || result.has(ancestor.opId)) continue;
    result.set(ancestor.opId, ancestor);
    pending.push(...Object.entries(ancestor.causalContext || {}));
  }
  return [...result.values()].reverse();
}

function describe(operation) {
  return {
    opId: operation.opId || null,
    actorId: operation.actorId || operation.agentId || null,
    transactionId: operation.transactionId || null,
    field: operation.kind?.key || null,
    intent: operation.intent || null,
    evidence: operation.evidence || null,
    dot: operation.dot || null,
    timestampMs: operation.timestampMs
  };
}

function readCurrent(session, path) {
  return session.crdt.getSnapshot().sharedFields[path];
}

module.exports = { explain };
