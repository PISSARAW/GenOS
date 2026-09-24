'use strict';

const evaluator = require('../invariants/invariantEvaluator');

function localize(session) {
  const snapshot = session.crdt.getSnapshot();
  const failures = evaluator.evaluateAll(session.schema?.invariants || {}, snapshot.sharedFields)
    .filter((receipt) => !receipt.passed && receipt.severity !== 'WARNING');
  const history = session.crdt.getHistory();
  return failures.map((failure) => explainFailure(failure, session.schema.invariants[failure.invariantId], history));
}

function explainFailure(failure, invariant, history) {
  const fields = [...new Set([...(invariant.scope || []), ...(invariant.dependencies || [])])];
  const candidates = history.filter((operation) => fields.includes(operation.kind?.key));
  const ancestors = collectAncestors(candidates, history);
  return {
    invariantId: failure.invariantId,
    affectedFields: fields,
    candidateOperations: candidates.map(describe),
    causalAncestors: ancestors.map(describe),
    actors: [...new Set([...candidates, ...ancestors].map((operation) => operation.actorId || operation.agentId).filter(Boolean))]
  };
}

function collectAncestors(candidates, history) {
  const pending = candidates.flatMap((operation) => Object.entries(operation.causalContext || {}));
  const found = new Map();
  while (pending.length) {
    const [actor, sequence] = pending.pop();
    const ancestor = history.find((operation) => operation.dot?.actorId === actor && operation.dot.sequence === sequence);
    if (!ancestor || found.has(ancestor.opId)) continue;
    found.set(ancestor.opId, ancestor);
    pending.push(...Object.entries(ancestor.causalContext || {}));
  }
  return [...found.values()];
}

function describe(operation) {
  return { opId: operation.opId || null, actorId: operation.actorId || operation.agentId || null, field: operation.kind?.key || null };
}

module.exports = { localize };
