'use strict';

const OPERATORS = new Set(['equals', 'not_equals', 'present', 'non_negative', 'min', 'max', 'includes', 'all', 'any']);

function compile(input = []) {
  const entries = Array.isArray(input) ? input.map((item) => [item?.invariantId || item?.id, item]) : Object.entries(input || {});
  const invariants = {};
  for (const [key, definition] of entries) {
    const invariantId = String(definition?.invariantId || definition?.id || key || '').trim();
    if (!invariantId || invariants[invariantId]) throw invariantError(`Invariant '${invariantId}' is empty or duplicated.`);
    invariants[invariantId] = normalizeInvariant(invariantId, definition);
  }
  return invariants;
}

function normalizeInvariant(invariantId, definition = {}) {
  const evaluationMode = String(definition.evaluationMode || 'DETERMINISTIC').toUpperCase();
  if (evaluationMode !== 'DETERMINISTIC') throw invariantError(`Invariant '${invariantId}' uses unsupported evaluation mode '${evaluationMode}'.`);
  const predicate = normalizePredicate(definition.predicate);
  return {
    invariantId,
    scope: normalizeList(definition.scope),
    dependencies: normalizeList(definition.dependencies),
    predicate,
    severity: String(definition.severity || 'ERROR').toUpperCase(),
    evaluationMode,
    repairPolicy: definition.repairPolicy || 'NONE'
  };
}

function normalizePredicate(predicate) {
  if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) throw invariantError('Invariant predicate must be an object.');
  const operator = String(predicate.op || '').toLowerCase();
  if (!OPERATORS.has(operator)) throw invariantError(`Unsupported invariant predicate '${operator}'.`);
  const normalized = { ...predicate, op: operator };
  if (operator === 'all' || operator === 'any') normalized.predicates = (predicate.predicates || []).map(normalizePredicate);
  return normalized;
}

function normalizeList(values) {
  if (typeof values === 'string') return [values];
  return Array.isArray(values) ? [...new Set(values.map(String))] : [];
}

function invariantError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_INVARIANT_SCHEMA_INVALID' });
}

module.exports = { compile };
