'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runGuarded } = require('../../src/services/relationalPhysiology/runtimeBoundary');
const { digest } = require('../../src/services/relationalPhysiology');
const { input, relation, NOW } = require('./helpers.cjs');

function harness(value, overrides = {}) {
  const log = [];
  const ports = {
    // Simulated host fence: these tests prove port ordering, not a distributed lock.
    withBoundary: async (_id, task) => { log.push('fence'); return task(); },
    loadContext: async () => { log.push('load'); return value.context; },
    authorize: async (request) => {
      log.push('authorize');
      return { ...value.authorization, requestHash: digest(request) };
    },
    recordDecision: async (decision) => { log.push(decision.permitted ? 'record:eligible' : 'record:denied'); },
    execute: async (envelope) => { log.push(envelope); return { transportAccepted: true }; },
    now: () => NOW,
    ...overrides
  };
  return { log, ports };
}

test('denied action never reaches the executor', async () => {
  const value = input(); value.authorization.allowed = false;
  const { log, ports } = harness(value);
  const result = await runGuarded(value.request, ports);
  assert.equal(result.status, 'denied');
  assert.deepEqual(log, ['fence', 'load', 'authorize', 'record:denied']);
});
test('reduced allowlist is actually passed to the transport', async () => {
  const value = input('communicate'); value.context.relations = [relation('adversary', ['A', 'B'])];
  const { log, ports } = harness(value);
  const result = await runGuarded(value.request, ports);
  assert.equal(result.status, 'executed');
  const actual = log.find((item) => typeof item === 'object');
  assert.deepEqual(actual.plan.refs.map((ref) => ref.id), ['evidence', 'problem']);
  assert.equal(Object.hasOwn(actual.plan, 'redactedRefIds'), false);
  assert.equal(Object.hasOwn(actual.plan, 'body'), false);
});
test('receipt is recorded before dispatch admission', async () => {
  const value = input(); const { log, ports } = harness(value);
  await runGuarded(value.request, ports);
  assert.equal(log[3], 'record:eligible'); assert.equal(typeof log[4], 'object');
});
test('audit persistence failure stops execution', async () => {
  const value = input();
  const { log, ports } = harness(value, { recordDecision: async () => { throw new Error('audit-unavailable'); } });
  await assert.rejects(runGuarded(value.request, ports), /audit-unavailable/);
  assert.equal(log.some((entry) => typeof entry === 'object'), false);
});
test('missing host fence is not replaced by an unsafe fallback', async () => {
  const value = input(); const { ports } = harness(value); delete ports.withBoundary;
  await assert.rejects(runGuarded(value.request, ports), /RPE_MISSING_PORT:withBoundary/);
});
test('unavailable graph source fails closed', async () => {
  const value = input(); const { log, ports } = harness(value, { loadContext: async () => { throw new Error('graph-down'); } });
  await assert.rejects(runGuarded(value.request, ports), /graph-down/);
  assert.equal(log.some((entry) => typeof entry === 'object'), false);
});
test('client-supplied backdated clock cannot revive a lease', async () => {
  const value = input(); value.request.at = 1; value.authorization.validUntil = NOW;
  const { log, ports } = harness(value);
  const result = await runGuarded(value.request, ports);
  assert.equal(result.status, 'denied');
  assert.ok(result.decision.reasonCodes.includes('AUTHORIZATION_EXPIRED'));
  assert.equal(log.some((entry) => typeof entry === 'object'), false);
});
test('reloading a changed graph invalidates the queued action', async () => {
  const value = input(); value.context.revision = 2;
  const { ports } = harness(value);
  const result = await runGuarded(value.request, ports);
  assert.ok(result.decision.reasonCodes.includes('RELATION_REVISION_CHANGED'));
});
test('silence skips the transport but retains the decision receipt', async () => {
  const value = input('communicate'); value.request.refs = [];
  const { log, ports } = harness(value);
  const result = await runGuarded(value.request, ports);
  assert.equal(result.status, 'silent'); assert.equal(log.at(-1), 'record:eligible');
});
test('executor failure is propagated, never turned into verified success', async () => {
  const value = input();
  const { ports } = harness(value, { execute: async () => { throw new Error('real-tool-failure'); } });
  await assert.rejects(runGuarded(value.request, ports), /real-tool-failure/);
});
