'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('../../src/services/relationalPhysiology');
const { input, bind, relation, origin } = require('./helpers.cjs');

test('three separated origin records admit two verifier provenance groups', () => {
  const result = evaluate(input('verify'));
  assert.equal(result.permitted, true); assert.equal(result.plan.groupCount, 2);
});
test('no relationship is not proof of independence', () => {
  const value = input('verify'); value.context.origins = [];
  const result = evaluate(value);
  assert.equal(result.permitted, false); assert.equal(result.plan.groupCount, 0);
  assert.ok(result.plan.excluded.every((item) => item.reason === 'ORIGIN_UNKNOWN'));
});
test('a stranger/verifier preset never replaces provenance', () => {
  for (const type of ['stranger', 'verifier', 'reviewer', 'adversary']) {
    const value = input('verify'); value.context.origins = [];
    value.context.relations = [relation(type, ['B', 'C'])];
    assert.equal(evaluate(value).permitted, false);
  }
});
test('twins are not independent verifiers of one another', () => {
  const value = input('verify'); value.context.relations = [relation('twin', ['B', 'C'])];
  const result = evaluate(value);
  assert.equal(result.plan.groupCount, 1); assert.equal(result.permitted, false);
});
test('transitive ancestry remains blocking across several edges', () => {
  const value = input('verify');
  value.context.relations = [relation('parent', ['B', 'A']), relation('parent', ['A', 'C']), relation('twin', ['C', 'D'])];
  assert.equal(evaluate(value).plan.groupCount, 0);
});
test('revoking a lineage edge cannot erase shared origin', () => {
  const value = input('verify'); value.context.relations = [relation('twin', ['B', 'C'], { state: 'revoked' })];
  assert.equal(evaluate(value).plan.groupCount, 1);
});
test('expiry of a lineage edge cannot create independence either', () => {
  const value = input('verify'); value.context.relations = [relation('parent', ['B', 'C'], { state: 'expired', validUntil: 100 })];
  assert.equal(evaluate(value).plan.groupCount, 1);
});
test('two reviewers with shared provenance count as one group', () => {
  const value = input('verify'); value.context.relations = [relation('sibling', ['C', 'D'])];
  const result = evaluate(value);
  assert.deepEqual(result.plan.groups, [['C', 'D']]); assert.equal(result.permitted, false);
});
test('same model family is a conservative dependence factor', () => {
  const value = input('verify'); value.context.origins[2].modelFamily = value.context.origins[1].modelFamily;
  assert.equal(evaluate(value).plan.groupCount, 1);
});
test('shared evidence and memory each prevent false multiplicity', () => {
  for (const field of ['evidenceRoots', 'memoryRoots']) {
    const value = input('verify');
    value.context.origins[1][field] = ['shared']; value.context.origins[2][field] = ['shared'];
    assert.equal(evaluate(value).plan.groupCount, 1);
  }
});
test('friendship does not invent either dependence or independence', () => {
  const value = input('verify'); value.context.relations = [relation('friend', ['C', 'D'])];
  assert.equal(evaluate(value).plan.groupCount, 2);
});
test('unblinded, unvalidated or expired provenance is unknown', () => {
  for (const override of [{ blinded: false }, { validated: false }, { validUntil: 10000 }, { observedAt: 10001 }, { modelFamily: 42 }]) {
    const value = input('verify'); value.context.origins[1] = origin('C', override);
    assert.equal(evaluate(value).plan.groupCount, 1);
  }
});
test('conflicting origin records are not optimistically chosen', () => {
  const value = input('verify'); value.context.origins.push(origin('C'));
  assert.equal(evaluate(value).plan.groupCount, 1);
});
test('self-review cannot count as another evidence group', () => {
  const value = input('verify'); value.request.verifierIds = ['B']; value.request.minGroups = 1;
  assert.equal(evaluate(bind(value)).permitted, false);
});
test('duplicates and invalid minGroups fail instead of inflating quorum', () => {
  const value = input('verify'); value.request.verifierIds = ['C', 'C'];
  assert.throws(() => evaluate(bind(value)), /duplicate/);
  value.request.verifierIds = ['C']; value.request.minGroups = 0;
  assert.throws(() => evaluate(bind(value)), /minGroups/);
});
test('absence of typed evidence gate blocks promotion despite separation', () => {
  const value = input('verify'); value.authorization.evidenceGatePassed = false;
  assert.equal(evaluate(value).permitted, false);
});
test('provenance separation is not advertised as statistical independence', () => {
  const value = input('verify'); value.request.requirement = 'statistical_independence';
  assert.ok(evaluate(bind(value)).reasonCodes.includes('STATISTICAL_INDEPENDENCE_NOT_ESTABLISHED'));
});
test('unknown or suspended verifiers do not count', () => {
  const value = input('verify'); value.context.agents[2].state = 'suspended';
  value.request.verifierIds = ['C', 'missing'];
  assert.equal(evaluate(bind(value)).plan.groupCount, 0);
});
test('lineage cycles terminate conservatively, never creating extra votes', () => {
  const value = input('verify');
  value.context.relations = [relation('parent', ['B', 'C']), relation('parent', ['C', 'B'])];
  assert.equal(evaluate(value).plan.groupCount, 1);
});
