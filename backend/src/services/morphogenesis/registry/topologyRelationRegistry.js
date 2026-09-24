'use strict';

const RELATIONS = Object.freeze([
  'SYNERGISTIC', 'COMPATIBLE_WITH_ADAPTER', 'ANTAGONISTIC', 'FORBIDDEN', 'UNSPECIFIED'
]);

function normalizeTopology(value) {
  return String(value || '').toLowerCase().replace(/[- ]/g, '_');
}

function relationKey(left, right) {
  return [normalizeTopology(left), normalizeTopology(right)].sort().join('::');
}

function validRelation(value) {
  return RELATIONS.includes(value);
}

function matchesConditions(conditions, context) {
  return Object.entries(conditions || {}).every(([key, value]) => context[key] === value);
}

function resolveRelation(entry, context) {
  const rule = (entry.rules || []).find((candidate) => matchesConditions(candidate.when, context));
  const selected = rule || entry.default;
  return {
    left: entry.left,
    right: entry.right,
    relation: selected.relation,
    adapterRequired: Boolean(selected.adapterRequired),
    evidenceStatus: selected.evidenceStatus || entry.evidenceStatus,
    reason: selected.reason || null,
    matchedConditions: rule ? { ...rule.when } : {}
  };
}

function valueOr(value, fallback) {
  return value || fallback;
}

function createEntry(input) {
  const evidenceStatus = valueOr(input.evidenceStatus, 'unspecified');
  const adapterRequired = Boolean(input.adapterRequired);
  const relation = valueOr(input.relation, 'UNSPECIFIED');
  const defaultRule = input.default || { relation, adapterRequired, evidenceStatus };
  const rules = Array.isArray(input.rules) ? input.rules.map((rule) => ({ ...rule, when: { ...rule.when } })) : [];
  return { ...input, relation, adapterRequired, evidenceStatus, default: defaultRule, rules };
}

function createTopologyRelationRegistry() {
  const relations = new Map();

  function register(input = {}) {
    if (!input.left || !input.right) throw new Error('left and right topology ids are required');
    const key = relationKey(input.left, input.right);
    const entry = createEntry(input);
    validateEntry(entry);
    relations.set(key, entry);
    return resolveRelation(entry, {});
  }

  function get(left, right, context = {}) {
    const entry = relations.get(relationKey(left, right));
    if (!entry) return { left, right, relation: 'UNSPECIFIED', adapterRequired: true, evidenceStatus: 'unknown' };
    return resolveRelation(entry, context);
  }

  return { register, get };
}

function validateEntry(entry) {
  if (!entry.left || !entry.right || !validRelation(entry.default.relation)) {
    throw new Error('relation registration contains invalid topology ids or default relation');
  }
  for (const rule of entry.rules) {
    if (!rule.when || !validRelation(rule.relation)) throw new Error('relation rule requires conditions and a valid relation');
  }
}

module.exports = { RELATIONS, createTopologyRelationRegistry, relationKey };
