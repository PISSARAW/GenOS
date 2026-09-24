'use strict';

function relationKey(left, right) {
  return [left, right].sort().join('::');
}

function createTopologyRelationRegistry() {
  const relations = new Map();

  function register(input = {}) {
    if (!input.left || !input.right || !input.relation) throw new Error('left, right and relation are required');
    const key = relationKey(input.left, input.right);
    const entry = {
      left: input.left,
      right: input.right,
      relation: input.relation,
      adapterRequired: Boolean(input.adapterRequired),
      evidenceStatus: input.evidenceStatus || 'unspecified'
    };
    relations.set(key, entry);
    return { ...entry };
  }

  function get(left, right) {
    return relations.get(relationKey(left, right)) || {
      left, right, relation: 'UNSPECIFIED', adapterRequired: true, evidenceStatus: 'unknown'
    };
  }

  return { register, get };
}

module.exports = { createTopologyRelationRegistry, relationKey };
