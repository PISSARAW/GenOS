'use strict';

const { LINEAGE } = require('./catalog');
const { sameScope } = require('./validate');

function relevantRelations(context) {
  return context.relations.filter((relation) => sameScope(relation.scope, context.scope));
}
function activeRelations(context, at) {
  return relevantRelations(context).filter((relation) => relation.state === 'active'
    && relation.validFrom <= at && (relation.validUntil === null || at < relation.validUntil));
}
function between(relations, pair) {
  return relations.filter((relation) => (relation.sourceId === pair[0] && relation.targetId === pair[1])
    || (relation.targetId === pair[0] && relation.sourceId === pair[1]));
}

class Components {
  constructor(ids) { this.parent = new Map(ids.map((id) => [id, id])); }
  root(id) {
    if (!this.parent.has(id)) throw new Error('RPE_UNKNOWN_COMPONENT');
    let current = id;
    while (this.parent.get(current) !== current) current = this.parent.get(current);
    let next = id;
    while (this.parent.get(next) !== next) {
      const previous = this.parent.get(next);
      this.parent.set(next, current);
      next = previous;
    }
    return current;
  }
  join(a, b) {
    const roots = [this.root(a), this.root(b)].sort();
    this.parent.set(roots[1], roots[0]);
  }
  connected(a, b) { return this.root(a) === this.root(b); }
}

function lineageComponents(context, at) {
  const components = new Components(context.agents.map((agent) => agent.id));
  for (const relation of relevantRelations(context)) {
    // Revocation ends an operational relationship, not historical shared origin.
    // Only an explicitly refuted origin may be removed by a trusted graph adapter.
    if (LINEAGE.includes(relation.type) && relation.state !== 'proposed' && relation.validFrom <= at) {
      components.join(relation.sourceId, relation.targetId);
    }
  }
  return components;
}

function relationIds(context, at) {
  return activeRelations(context, at).map((relation) => relation.id).sort();
}

module.exports = { Components, relevantRelations, activeRelations, between, lineageComponents, relationIds };
