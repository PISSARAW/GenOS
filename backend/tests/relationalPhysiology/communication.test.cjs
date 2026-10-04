'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('../../src/services/relationalPhysiology');
const { CONTROL_EVENTS } = require('../../src/services/relationalPhysiology/catalog');
const { input, bind, relation } = require('./helpers.cjs');

function knownAll(value) {
  value.context.groundings = value.request.refs.map((ref) => ({
    senderId: 'A', receiverId: 'B', refId: ref.id, hash: ref.hash, validated: true, observedAt: 1
  }));
}

test('adversarial channel transmits evidence, not conclusions', () => {
  const value = input('communicate'); value.context.relations = [relation('adversary', ['B', 'A'])];
  const decision = evaluate(value);
  assert.equal(decision.permitted, true);
  assert.deepEqual(decision.plan.refs.map((ref) => ref.id), ['evidence', 'problem']);
  assert.deepEqual(decision.plan.redactedRefIds, ['conclusion']);
});
test('friendship cannot override a simultaneous blind verifier relation', () => {
  const value = input('communicate');
  value.context.relations = [relation('friend', ['A', 'B']), relation('verifier', ['B', 'A'])];
  assert.equal(evaluate(value).plan.blind, true);
  assert.equal(evaluate(value).plan.refs.some((ref) => ref.kind === 'conclusion'), false);
});
test('explicit blind mode works with no relation', () => {
  const value = input('communicate'); value.request.blind = true;
  assert.equal(evaluate(bind(value)).plan.refs.length, 2);
});
test('expired and cross-project social constraints do not apply', () => {
  const value = input('communicate');
  value.context.relations = [relation('adversary', ['A', 'B'], { validUntil: value.request.at }),
    relation('verifier', ['B', 'A'], { scope: { organizationId: 'elsewhere', projectId: 'p' } })];
  assert.equal(evaluate(value).plan.blind, false);
});
test('ACL allowlist removes inaccessible references regardless of friendship', () => {
  const value = input('communicate'); value.context.relations = [relation('friend', ['A', 'B'])];
  value.authorization.readableRefIds = ['problem'];
  assert.deepEqual(evaluate(value).plan.refs.map((ref) => ref.id), ['problem']);
});
test('malformed ACL string cannot be used as a substring allowlist', () => {
  const value = input('communicate'); value.authorization.readableRefIds = 'problem';
  assert.throws(() => evaluate(value), /readableRefIds/);
});
test('unauthorized recipient prevents transmission', () => {
  const value = input('communicate'); value.authorization.recipientIds = [];
  const result = evaluate(value); assert.equal(result.permitted, false);
  assert.ok(result.reasonCodes.includes('RECIPIENT_NOT_AUTHORIZED'));
});
test('social preset alone never deduplicates a message', () => {
  const value = input('communicate'); value.context.relations = [relation('bonded_partner', ['A', 'B'])];
  assert.equal(evaluate(value).plan.disposition, 'send');
  assert.equal(evaluate(value).plan.refs.length, 3);
});
test('acknowledged exact reference hashes permit silence', () => {
  const value = input('communicate'); knownAll(value);
  const result = evaluate(value);
  assert.equal(result.plan.disposition, 'silence');
  assert.equal(result.plan.deduplicatedRefIds.length, 3);
});
test('changed reference hash is not suppressed by stale acknowledgement', () => {
  const value = input('communicate'); knownAll(value);
  value.request.refs[0].hash = 'new-revision';
  assert.deepEqual(evaluate(bind(value)).plan.refs.map((ref) => ref.id), ['problem']);
});
test('all critical control events survive common-ground silence', () => {
  for (const event of CONTROL_EVENTS) {
    const value = input('communicate'); knownAll(value); value.request.event = event;
    const result = evaluate(bind(value));
    assert.equal(result.plan.disposition, 'send');
    assert.equal(result.plan.event, event);
    assert.equal(result.plan.requiredAck, 'action_ack');
  }
});
test('control event remains deliverable with no readable content', () => {
  const value = input('communicate'); value.request.event = 'stop'; value.authorization.readableRefIds = [];
  const result = evaluate(bind(value));
  assert.equal(result.plan.disposition, 'send'); assert.deepEqual(result.plan.refs, []);
});
test('existing human-confirmation requirement is never weakened', () => {
  const value = input('communicate'); value.authorization.requiredAck = 'human_confirmation';
  assert.equal(evaluate(value).plan.requiredAck, 'human_confirmation');
});
