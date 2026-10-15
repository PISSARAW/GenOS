'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const lease = require('../src/services/runtimeControlCapabilityLease');

const identity = Object.freeze({
  workerId: 'worker-lease', missionId: 'mission-lease', episodeId: 'episode-lease',
  threadId: 'thread-lease', organizationId: 'org-lease', projectId: 'project-lease'
});

function renewal(sequence, overrides = {}) {
  return {
    type: lease.RENEW_TYPE, protocolVersion: lease.PROTOCOL_VERSION,
    sequence, lineage: { ...identity }, ...overrides
  };
}

function child() {
  const instance = new EventEmitter();
  instance.connected = true;
  instance.genosControlIdentity = identity;
  return instance;
}

function ready() {
  return {
    type: 'genos-runtime-control-ready', protocolVersion: 1,
    lineage: { ...identity }, actions: ['pause', 'resume', 'cancel', 'resume_checkpoint']
  };
}

function freshCapabilityModule() {
  const path = require.resolve('../src/services/runtimeControlCapability');
  delete require.cache[path];
  return require(path);
}

test('lease expires closed and cannot be revived', () => {
  const started = lease.start(1000);
  assert.equal(lease.fresh(started, 1000 + lease.DEFAULT_TTL_MS - 1), true);
  assert.equal(lease.fresh(started, 1000 + lease.DEFAULT_TTL_MS), false);
  assert.equal(lease.renew(started, renewal(1), {
    lineage: identity, now: 1000 + lease.DEFAULT_TTL_MS
  }), null);
});

test('renewal requires the next sequence and the exact lineage', () => {
  const started = lease.start(1000);
  const renewed = lease.renew(started, renewal(1), { lineage: identity, now: 2000 });
  assert.equal(renewed.sequence, 1);
  assert.equal(renewed.expiresAt, 2000 + lease.DEFAULT_TTL_MS);
  assert.equal(lease.renew(renewed, renewal(1), { lineage: identity, now: 2001 }), null);
  assert.equal(lease.renew(renewed, renewal(2, {
    lineage: { ...identity, organizationId: 'org-other' }
  }), { lineage: identity, now: 2001 }), null);
  assert.equal(lease.renew(renewed, { ...renewal(2), injected: true }, {
    lineage: identity, now: 2001
  }), null);
});

test('a fresh backend module refuses an attestation held by its predecessor', () => {
  const runtime = child();
  const first = freshCapabilityModule();
  first.bind(runtime);
  runtime.emit('message', ready());
  assert.equal(first.supports(runtime, 'pause'), true);

  const restarted = freshCapabilityModule();
  assert.equal(restarted.supports(runtime, 'pause'), false);
});

test('a malformed renewal poisons the process-local capability', () => {
  const capability = freshCapabilityModule();
  const runtime = child();
  capability.bind(runtime);
  runtime.emit('message', ready());
  runtime.emit('message', renewal(2));
  assert.equal(capability.supports(runtime, 'pause'), false);
  runtime.emit('message', renewal(1));
  assert.equal(capability.supports(runtime, 'pause'), false);
});

test('renewal before ready poisons capability negotiation', () => {
  const capability = freshCapabilityModule();
  const runtime = child();
  capability.bind(runtime);
  runtime.emit('message', renewal(1));
  runtime.emit('message', ready());
  assert.equal(capability.supports(runtime, 'pause'), false);
});

test('an exact renewal extends the live process capability', () => {
  const capability = freshCapabilityModule();
  const runtime = child();
  capability.bind(runtime);
  runtime.emit('message', ready());
  runtime.emit('message', renewal(1));
  assert.equal(capability.supports(runtime, 'resume_checkpoint'), true);
});
