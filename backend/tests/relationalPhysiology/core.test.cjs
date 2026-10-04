'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, replay, digest } = require('../../src/services/relationalPhysiology');
const { TYPES } = require('../../src/services/relationalPhysiology/catalog');
const { input, bind, relation } = require('./helpers.cjs');

function denied(value, reason) {
  const decision = evaluate(bind(value));
  assert.equal(decision.permitted, false);
  assert.ok(decision.reasonCodes.includes(reason), decision.reasonCodes.join(','));
}

test('catalog matches the 29 unique GenOS relation types', () => {
  assert.equal(TYPES.length, 29);
  assert.equal(new Set(TYPES).size, 29);
});
test('base authorized read is eligible, with reproducible receipt', () => {
  const value = input();
  const decision = evaluate(value);
  assert.equal(decision.permitted, true);
  assert.equal(replay(value, decision).matches, true);
});
test('a relation cannot override the base authority gate', () => {
  const value = input();
  value.authorization.allowed = false;
  value.context.relations = [relation('manager', ['A', 'B'])];
  denied(value, 'BASE_AUTHORIZATION_DENIED');
});
test('all 29 relation labels remain unable to mint permissions', () => {
  for (const type of TYPES) {
    const value = input();
    value.authorization.allowed = false;
    value.context.relations = [relation(type, ['A', 'B'])];
    denied(value, 'BASE_AUTHORIZATION_DENIED');
  }
});
test('mutating a request after authorization is rejected', () => {
  const value = input();
  value.request.action = 'write';
  assert.ok(evaluate(value).reasonCodes.includes('AUTHORIZATION_REQUEST_MISMATCH'));
});
test('lease must bind operation and actor', () => {
  for (const [key, reason] of [['operationId', 'AUTHORIZATION_OPERATION_MISMATCH'], ['actorId', 'AUTHORIZATION_ACTOR_MISMATCH']]) {
    const value = input(); value.authorization[key] = 'other'; denied(value, reason);
  }
});
test('expired authorization is denied at the exact expiry boundary', () => {
  const value = input(); value.authorization.validUntil = value.request.at; denied(value, 'AUTHORIZATION_EXPIRED');
});
test('all capability layers must allow the action', () => {
  const value = input(); value.authorization.actionCeilings[1] = []; denied(value, 'ACTION_OUTSIDE_CEILING');
});
test('capabilities never expand when another ceiling is intersected', () => {
  for (const ceiling of [[], ['read'], ['write'], ['delegate'], ['read', 'write']]) {
    const base = input();
    base.authorization.actionCeilings = [['read'], ceiling];
    if (!ceiling.includes('read')) denied(base, 'ACTION_OUTSIDE_CEILING');
    else assert.equal(evaluate(base).permitted, true);
  }
});
test('exact resource ceilings reject unlisted resources', () => {
  const value = input(); value.request.resource = '../secret'; denied(value, 'RESOURCE_OUTSIDE_CEILING');
});
test('a daemon cannot write even with an incorrectly broad base grant', () => {
  const value = input(); value.context.agents[0].role = 'resident_daemon'; value.request.action = 'write';
  denied(value, 'OBSERVER_CANNOT_MUTATE');
});
test('worker cannot self-promote even with evidence and broad base grant', () => {
  const value = input(); value.context.agents[0].role = 'worker'; value.request.action = 'promote';
  denied(value, 'ROLE_CANNOT_PROMOTE');
});
test('promotion needs the original evidence gate, not a relation', () => {
  const value = input(); value.request.action = 'promote'; value.authorization.evidenceGatePassed = false;
  value.context.relations = [relation('verifier', ['B', 'A'])]; denied(value, 'EVIDENCE_GATE_REQUIRED');
});
test('cross-project and changed revision snapshots are rejected', () => {
  const value = input(); value.request.scope.projectId = 'other'; denied(value, 'SCOPE_MISMATCH');
  const changed = input(); changed.context.revision += 1; denied(changed, 'RELATION_REVISION_CHANGED');
});
test('future or stale snapshots cannot authorize an action', () => {
  const future = input(); future.context.asOf = future.request.at + 1; denied(future, 'SNAPSHOT_STALE');
  const stale = input(); stale.context.validUntil = stale.request.at; denied(stale, 'SNAPSHOT_STALE');
});
test('inactive or absent actors are denied', () => {
  const value = input(); value.context.agents[0].state = 'suspended'; denied(value, 'ACTOR_INACTIVE');
  const unknown = input(); unknown.request.actorId = 'ghost'; unknown.authorization.actorId = 'ghost'; denied(unknown, 'UNKNOWN_ACTOR');
});
test('malformed and oversized relation graphs fail closed', () => {
  const value = input(); value.context.relations = [relation('friend', ['A', 'A'])];
  assert.throws(() => evaluate(value), /relation.self/);
  value.context.relations = [relation('invented', ['A', 'B'])];
  assert.throws(() => evaluate(value), /relation.type/);
  value.context.relations = Array.from({ length: 2049 }, (_, id) => relation('friend', ['A', 'B'], { id: String(id) }));
  assert.throws(() => evaluate(value), /relations/);
});
test('receipts are deeply immutable and do not freeze caller input', () => {
  const value = input('delegate'); const decision = evaluate(value);
  assert.throws(() => { decision.plan.budget.tokens = 999; }, TypeError);
  value.request.budget.tokens = 11;
  assert.equal(decision.plan.budget.tokens, 10);
});
test('hashes are typed, key-order stable and reject ambiguous inputs', () => {
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assert.notEqual(digest(['ab', 'c']), digest(['a', 'bc']));
  assert.notEqual(digest(1), digest('1'));
  assert.notEqual(digest([1]), digest({ 0: 1 }));
  assert.throws(() => digest(NaN), /NON_FINITE/);
  const loop = {}; loop.self = loop; assert.throws(() => digest(loop), /CYCLIC/);
});
test('replay detects changes to graph history', () => {
  const value = input(); const decision = evaluate(value);
  value.context.relations.push(relation('friend', ['A', 'B']));
  assert.equal(replay(value, decision).matches, false);
});
