'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, digest } = require('../../src/services/relationalPhysiology');
const { transition } = require('../../src/services/relationalPhysiology/lifecycle');
const { summarize } = require('../../src/services/relationalPhysiology/learning');
const { input, bind, relation, SCOPE } = require('./helpers.cjs');

test('bounded delegation is allowed only within every budget dimension', () => {
  assert.equal(evaluate(input('delegate')).permitted, true);
  for (const key of ['tokens', 'milliseconds', 'microUsd']) {
    const value = input('delegate'); value.request.budget[key] = 101;
    assert.ok(evaluate(bind(value)).reasonCodes.includes(`BUDGET_EXCEEDED:${key}`));
  }
});
test('NaN and negative budget cannot bypass bounds', () => {
  const value = input('delegate'); value.request.budget.tokens = -1;
  assert.throws(() => evaluate(bind(value)), /budget.tokens/);
  value.request.budget.tokens = NaN; assert.throws(() => bind(value), /NON_FINITE/);
});
test('spawn count and delegation depth are independently bounded', () => {
  const value = input('delegate'); value.request.activeChildren = 5; value.request.depth = 2;
  const result = evaluate(bind(value));
  assert.ok(result.reasonCodes.includes('SPAWN_LIMIT_EXCEEDED'));
  assert.ok(result.reasonCodes.includes('DEPTH_EXCEEDED'));
});
test('calling a worker a manager does not authorize delegation', () => {
  const value = input('delegate'); value.context.agents[0].role = 'worker';
  value.context.relations = [relation('manager', ['A', 'B'])];
  assert.ok(evaluate(value).reasonCodes.includes('ROLE_CANNOT_DELEGATE'));
});
test('the observational daemon remains unable to spawn through delegation', () => {
  const value = input('delegate'); value.context.agents[0].role = 'resident_daemon';
  assert.equal(evaluate(value).permitted, false);
});
test('an unadmitted guardian label does not install a veto', () => {
  const value = input(); value.context.relations = [relation('guardian', ['B', 'A'])];
  assert.equal(evaluate(value).permitted, true);
});
test('an authority-admitted guardian requires a request-bound approval', () => {
  const value = input(); const edge = relation('guardian', ['B', 'A']); value.context.relations = [edge];
  value.authorization.guardianRules = [{ relationId: edge.id }];
  assert.ok(evaluate(value).reasonCodes.includes('GUARDIAN_APPROVAL_REQUIRED'));
  value.authorization.approvals = [{ signerId: 'B', operationId: 'op-1', requestHash: digest(value.request), validated: true, validUntil: 20000 }];
  assert.equal(evaluate(value).permitted, true);
  value.authorization.approvals[0].requestHash = 'other-request';
  assert.equal(evaluate(value).permitted, false);
});
test('guardian direction is never silently inverted', () => {
  const value = input(); const edge = relation('guardian', ['A', 'B']); value.context.relations = [edge];
  value.authorization.guardianRules = [{ relationId: edge.id }];
  assert.ok(evaluate(value).reasonCodes.includes('REQUIRED_GUARDIAN_UNAVAILABLE'));
});
test('lifecycle supports revocation without deleting historical lineage', () => {
  const edge = { ...relation('twin', ['A', 'B']), version: 1, updatedAt: 0 };
  const result = transition(edge, { event: 'revoke', expectedVersion: 1, authorized: true, at: 10 });
  assert.equal(result.state, 'revoked'); assert.equal(result.retainHistoricalDependence, true);
  assert.equal(result.version, 2); assert.equal(edge.state, 'active');
});
test('lifecycle rejects stale writers and terminal-state resurrection', () => {
  const edge = { ...relation('temporary_ally', ['A', 'B']), version: 1, updatedAt: 0 };
  assert.throws(() => transition(edge, { event: 'revoke', expectedVersion: 0, authorized: true, at: 10 }), /version.conflict/);
  edge.state = 'revoked';
  assert.throws(() => transition(edge, { event: 'resume', expectedVersion: 1, authorized: true, at: 10 }), /transition/);
});
test('expiry is not permitted before the actual deadline', () => {
  const edge = { ...relation('temporary_ally', ['A', 'B'], { validUntil: 100 }), version: 1, updatedAt: 0 };
  assert.throws(() => transition(edge, { event: 'expire', expectedVersion: 1, authorized: true, at: 99 }), /premature/);
  assert.equal(transition(edge, { event: 'expire', expectedVersion: 1, authorized: true, at: 100 }).state, 'expired');
});
function observation(id, overrides = {}) {
  return { id, scope: SCOPE, subjectId: 'B', evaluatorId: 'C', domain: 'backend', receiptId: `receipt:${id}`,
    validated: true, independentEvaluator: true, outcome: 'pass', ...overrides };
}
const QUERY = { scope: SCOPE, subjectId: 'B', domain: 'backend' };
test('no observation means unknown, not synthetic familiarity', () => {
  const result = summarize([], QUERY); assert.equal(result.n, 0); assert.equal(result.posteriorMean, null);
});
test('learning counts unique validated observations only', () => {
  const a = observation('a'); const b = observation('b', { outcome: 'fail' });
  const result = summarize([a, a, b], QUERY);
  assert.equal(result.n, 2); assert.equal(result.posteriorMean, 0.5);
});
test('self-evaluation and unverified feedback are excluded', () => {
  assert.equal(summarize([observation('a', { evaluatorId: 'B' }), observation('b', { validated: false })], QUERY).n, 0);
});
test('trust stays domain- and project-scoped', () => {
  const result = summarize([observation('a', { domain: 'security' }), observation('b', { scope: { organizationId: 'other', projectId: 'other' } })], QUERY);
  assert.equal(result.n, 0);
});
test('conflicting replay of an observation ID is rejected', () => {
  assert.throws(() => summarize([observation('a'), observation('a', { outcome: 'fail' })], QUERY), /idempotency.conflict/);
});
