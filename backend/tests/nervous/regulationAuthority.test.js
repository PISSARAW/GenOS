'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, enroll, occupancy } = require('./regulationFixture');
const regulator = require('../../src/services/nervous/regulationRuntime');
const policies = require('../../src/services/nervous/regulationPolicy');
const controls = require('../../src/services/nervous/admissionControl');
const { dispatch } = require('../../src/services/nervous/effectGate');

test('regulation CLI validates commands, identities and signed policy arguments before database initialization', () => {
  const { argumentsOf } = require('../../bin/genos-nervous-regulation.cjs');
  assert.equal(argumentsOf(['episodes', 'orch']).managerId, 'orch');
  assert.throws(() => argumentsOf(['invented', 'orch']));
  assert.throws(() => argumentsOf(['sample', 'bad id']));
  assert.throws(() => argumentsOf(['enroll', 'orch']));
  assert.throws(() => argumentsOf(['episodes', 'orch', 'extra']));
});

test('fresh telemetry pressure alone cannot authorize the Garage actuator', async t => {
  const h = await fixture(t); const policy = await enroll(h);
  await h.runtime.ingest({ id: 'untrusted-pressure', agentId: 'orch', eventType: 'NERVOUS_RESOURCE_SAMPLE',
    timestamp: new Date().toISOString(), payload: { ...h.scope, resourcePressure: 1 } }, h.scope);
  const proposal = (await h.runtime.store.effects(h.scope)).map(row => JSON.parse(row.body))
    .find(item => item.action === 'INHIBIT_DISPATCH');
  const result = await dispatch(h.runtime.store, { id: proposal.id, scope: h.scope }, {
    mode: 'guarded', authorize: item => policies.authorize(h.db, { proposal: item, policy }),
    handlers: { INHIBIT_DISPATCH: () => assert.fail('unattested pressure cannot actuate') }
  });
  assert.equal(result.status, 'DENIED');
  assert.equal((await h.db.get('SELECT count(*) AS n FROM gns_admission_holds')).n, 0);
});

test('replay and modified enrollment contracts cannot silently expand a signed policy', async t => {
  const h = await fixture(t); await enroll(h);
  await assert.rejects(enroll(h), /VERSION_CONFLICT/);
  const input = { scope: h.scope, managerId: 'orch', actorId: 'orch', expectedVersion: 1,
    highThreshold: 0.9, expiresAt: Date.now() + 60000 };
  const authorization = h.owner.authorize({ operation: 'gns-regulation-enrollment', projectId: 'project',
    subjectId: 'orch', expectedVersion: 1, details: policies.contract(input) });
  await assert.rejects(policies.enroll(h.db, { ...input, highThreshold: 0.7, authorization }), /signature/);
  assert.equal((await policies.current(h.db, 'orch')).highThreshold, 0.9);
});

test('revoked project authority and revoked agent execution authority prevent new actuation', async t => {
  const h = await fixture(t); await enroll(h, { highThreshold: 0.8 }); await occupancy(h, 4);
  await h.db.run("UPDATE shev_responsibilities SET status='paused'");
  await regulator.sampleManager(h.db, 'orch');
  assert.equal((await h.journal.episodes(h.scope, 'orch')).length, 0);
  await assert.rejects(policies.current(h.db, 'orch'), /AUTHORITY_REVOKED/);
  await h.db.run("UPDATE shev_responsibilities SET status='active'");
  await h.db.run("INSERT INTO aeis_agent_dissonance VALUES('orch',99)");
  await assert.rejects(policies.current(h.db, 'orch'), { code: 'AEIS_AUTHORITY_REVOKED' });
});

test('the existing circuit breaker can deny a valid native GNS proposal', async t => {
  const h = await fixture(t); await enroll(h, { highThreshold: 0.8 }); await occupancy(h, 4);
  const breaker = require('../../src/services/circuitBreaker');
  const previous = breaker.toolLockOverrides.get('worker_deployment');
  breaker.toolLockOverrides.set('worker_deployment', true);
  t.after(() => {
    if (previous === undefined) breaker.toolLockOverrides.delete('worker_deployment');
    else breaker.toolLockOverrides.set('worker_deployment', previous);
  });
  await regulator.sampleManager(h.db, 'orch');
  assert.equal((await h.journal.episodes(h.scope, 'orch'))[0].status, 'DENIED');
  assert.equal((await h.db.get('SELECT count(*) AS n FROM gns_admission_holds')).n, 0);
  assert.equal(controls.enabled(), true);
});

test('an OPEN breaker prevents regulation even when the underlying operation is not classified destructive', async t => {
  const h = await fixture(t); await enroll(h, { highThreshold: 0.8 }); await occupancy(h, 4);
  const breaker = require('../../src/services/circuitBreaker');
  const original = { state: breaker.state, changedAt: breaker.lastStateChange };
  breaker.state = 'OPEN'; breaker.lastStateChange = Date.now();
  t.after(() => { breaker.state = original.state; breaker.lastStateChange = original.changedAt; });
  await regulator.sampleManager(h.db, 'orch');
  assert.equal((await h.journal.episodes(h.scope, 'orch'))[0].status, 'DENIED');
  assert.equal((await h.db.get('SELECT count(*) AS n FROM gns_admission_holds')).n, 0);
});
