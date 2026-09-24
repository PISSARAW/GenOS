'use strict';

function evaluateAll(registry, state) {
  return Object.values(registry || {}).map((invariant) => ({
    invariantId: invariant.invariantId,
    passed: evaluatePredicate(invariant.predicate, state),
    severity: invariant.severity,
    scope: invariant.scope,
    dependencies: invariant.dependencies,
    evaluationMode: invariant.evaluationMode,
    repairPolicy: invariant.repairPolicy
  }));
}

function evaluatePredicate(predicate, state) {
  if (predicate.op === 'all') return evaluateGroup(predicate.predicates, state, true);
  if (predicate.op === 'any') return evaluateGroup(predicate.predicates, state, false);
  const actual = readPath(state, predicate.path);
  return compare(predicate, actual);
}

function evaluateGroup(predicates, state, requireAll) {
  for (const predicate of predicates) {
    const passed = evaluatePredicate(predicate, state);
    if (requireAll && !passed) return false;
    if (!requireAll && passed) return true;
  }
  return requireAll;
}

function compare(predicate, actual) {
  const handlers = {
    equals: () => actual === predicate.value,
    not_equals: () => actual !== predicate.value,
    present: () => actual !== undefined && actual !== null,
    non_negative: () => Number.isFinite(actual) && actual >= 0,
    min: () => Number.isFinite(actual) && actual >= predicate.value,
    max: () => Number.isFinite(actual) && actual <= predicate.value,
    includes: () => Array.isArray(actual) && actual.includes(predicate.value)
  };
  return Boolean(handlers[predicate.op]?.());
}

function readPath(state, path) {
  const normalized = String(path || '');
  if (Object.hasOwn(state, normalized)) return state[normalized];
  return normalized.split('.').filter(Boolean).reduce((value, key) => value?.[key], state);
}

module.exports = { evaluateAll };
