'use strict';

const v = require('./effectValidation');

function bootstrap(input) {
  const value = v.copy(input);
  v.exact(value, ['scope', 'actor', 'authority', 'budget', 'permissions']);
  v.scope(value.scope); v.actor(value.actor); v.authority(value.authority); v.budget(value.budget);
  if (!Array.isArray(value.permissions) || value.permissions.length > 1000) throw new Error('OMEGA installed permissions required.');
  const known = new Set();
  for (const grant of value.permissions) {
    v.exact(grant, ['resourceId', 'reference', 'action', 'cost']);
    v.id(grant.resourceId); v.id(grant.reference); v.id(grant.action); v.integer(grant.cost);
    const key = JSON.stringify([grant.resourceId, grant.reference, grant.action]);
    if (known.has(key)) throw new Error('OMEGA duplicate installed resource permission.');
    known.add(key);
  }
  return value;
}

function fence(input) {
  const value = v.copy(input);
  v.exact(value, ['scope', 'previousActor', 'previousAuthority', 'actor', 'authority']);
  v.scope(value.scope); v.actor(value.previousActor); v.authority(value.previousAuthority);
  v.actor(value.actor); v.authority(value.authority);
  if (value.authority.authorityId !== value.previousAuthority.authorityId ||
      value.authority.generation !== value.previousAuthority.generation + 1) throw new Error('OMEGA authority fence must advance exactly once.');
  return value;
}

function current(state, request) {
  if (!state || !v.same(state.actor, request.actor) || !v.same(state.authority, request.authority)) {
    throw new Error('OMEGA receiver stale actor or authority.');
  }
}

function applicable(state, request) {
  current(state, request);
  const grant = state.permissions.find(item => item.resourceId === request.resourceId &&
    item.reference === request.reference && item.action === request.action);
  if (!grant || grant.cost !== request.cost) throw new Error('OMEGA receiver permission or tariff mismatch.');
  const allocation = state.budget;
  const expected = [allocation.unit, allocation.limit, allocation.reserved];
  const actual = [request.budget.unit, request.budget.limit, request.budget.reserved];
  if (!v.same(expected, actual) || request.budget.spent > allocation.spent) throw new Error('OMEGA receiver budget allocation mismatch.');
}

module.exports = { bootstrap, fence, current, applicable };
