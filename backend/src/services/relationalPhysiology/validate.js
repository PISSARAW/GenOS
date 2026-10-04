'use strict';

const { ROLES, TYPES, STATES } = require('./catalog');
const { digest } = require('./canonical');
const LIMITS = Object.freeze({ agents: 256, relations: 2048, origins: 1024 });

function invalid(reason) {
  throw Object.assign(new Error(`RPE_INVALID_INPUT:${reason}`), { code: 'RPE_INVALID_INPUT', reason });
}
function text(value, name) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 512) invalid(name);
}
function natural(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(name);
}
function scope(value) {
  if (!value || typeof value !== 'object') invalid('scope');
  text(value.organizationId, 'organizationId');
  text(value.projectId, 'projectId');
}
function sameScope(a, b) {
  return a?.organizationId === b?.organizationId && a?.projectId === b?.projectId;
}
function collection(value, name, limit) {
  if (!Array.isArray(value) || value.length > limit) invalid(name);
}
function unique(items, name) {
  const ids = new Set();
  for (const item of items) {
    text(item.id, `${name}.id`);
    if (ids.has(item.id)) invalid(`${name}.duplicate`);
    ids.add(item.id);
  }
}
function validateAgent(agent) {
  if (!ROLES.includes(agent.role)) invalid('agent.role');
  if (!['active', 'suspended', 'retired'].includes(agent.state)) invalid('agent.state');
}
function validateRelation(relation, agents) {
  if (!agents.has(relation.sourceId) || !agents.has(relation.targetId)) invalid('relation.endpoint');
  if (relation.sourceId === relation.targetId) invalid('relation.self');
  if (!TYPES.includes(relation.type)) invalid('relation.type');
  if (!STATES.includes(relation.state)) invalid('relation.state');
  scope(relation.scope);
  natural(relation.validFrom, 'relation.validFrom');
  if (relation.validUntil !== null) natural(relation.validUntil, 'relation.validUntil');
  if (relation.validUntil !== null && relation.validUntil <= relation.validFrom) invalid('relation.interval');
}
function validateContext(context) {
  if (!context || typeof context !== 'object') invalid('context');
  scope(context.scope);
  natural(context.revision, 'revision');
  natural(context.asOf, 'asOf');
  natural(context.validUntil, 'validUntil');
  if (context.validUntil <= context.asOf) invalid('context.interval');
  for (const [name, limit] of Object.entries(LIMITS)) collection(context[name], name, limit);
  collection(context.groundings || [], 'groundings', 4096);
  unique(context.agents, 'agents');
  unique(context.relations, 'relations');
  context.agents.forEach(validateAgent);
  const agents = new Set(context.agents.map((agent) => agent.id));
  context.relations.forEach((relation) => validateRelation(relation, agents));
}
function validateRequest(request) {
  if (!request || typeof request !== 'object') invalid('request');
  scope(request.scope);
  text(request.operationId, 'operationId');
  text(request.actorId, 'actorId');
  natural(request.at, 'at');
  natural(request.expectedRevision, 'expectedRevision');
  if (!['action', 'delegate', 'communicate', 'verify'].includes(request.kind)) invalid('request.kind');
}
function validateInput(input) {
  if (!input || typeof input !== 'object') invalid('input');
  // Also rejects undefined, NaN, cyclic structures and excessive nesting.
  digest(input);
  validateContext(input.context);
  validateRequest(input.request);
}

module.exports = { invalid, text, natural, scope, sameScope, collection, validateInput, LIMITS };
