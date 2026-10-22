'use strict';

const { requiredText, uniqueText } = require('./securityPerceptionPrimitives');

const STATES = new Set(['desired', 'observed', 'measured']);

function upsertEntity(world, input) {
  const id = requiredText(input?.id, 'ASP_WORLD_ENTITY_ID_REQUIRED', 128);
  const entity = { id, type: requiredText(input.type, 'ASP_WORLD_ENTITY_TYPE_REQUIRED', 64),
    attributes: input.attributes && typeof input.attributes === 'object' && !Array.isArray(input.attributes) ? input.attributes : {} };
  world.entities[id] = entity;
  return entity;
}

function addRelation(world, input) {
  const state = requiredText(input?.state, 'ASP_WORLD_RELATION_STATE_REQUIRED', 16);
  if (!STATES.has(state)) throw new Error('ASP_WORLD_RELATION_STATE_INVALID');
  const from = requiredText(input.from, 'ASP_WORLD_RELATION_FROM_REQUIRED', 128);
  const to = requiredText(input.to, 'ASP_WORLD_RELATION_TO_REQUIRED', 128);
  if (!world.entities[from] || !world.entities[to]) throw new Error('ASP_WORLD_RELATION_ENTITY_UNKNOWN');
  const relation = { from, type: requiredText(input.type, 'ASP_WORLD_RELATION_TYPE_REQUIRED', 64), to, state,
    evidenceRefs: uniqueText(input.evidenceRefs), observedAt: input.observedAt || new Date().toISOString() };
  if (relation.type === 'access-effective' && (state !== 'measured' || !relation.evidenceRefs.length)) {
    throw new Error('ASP_EFFECTIVE_ACCESS_REQUIRES_MEASURED_EVIDENCE');
  }
  world.relations.push(relation);
  world.relations = world.relations.slice(-5000);
  return relation;
}

function query(world, input = {}) {
  const relations = world.relations.filter((relation) => (!input.state || relation.state === input.state)
    && (!input.entityId || relation.from === input.entityId || relation.to === input.entityId));
  return { entities: world.entities, relations, accessProofs: relations.filter((relation) => relation.type === 'access-effective'
    && relation.state === 'measured' && relation.evidenceRefs.length > 0) };
}

module.exports = { STATES, upsertEntity, addRelation, query };
