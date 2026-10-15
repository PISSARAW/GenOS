'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const controlLease = require('../src/services/localRuntimeControlLease');

const lineage = Object.freeze({
  workerId: 'worker-child', missionId: 'mission-child', episodeId: 'episode-child',
  threadId: 'thread-child', organizationId: 'org-child', projectId: 'project-child'
});

function harness() {
  const channel = new EventEmitter();
  channel.connected = true;
  channel.sent = [];
  channel.send = (message, callback) => {
    channel.sent.push(message);
    if (callback) callback(channel.sendError || null);
  };
  const scheduler = { callback: null, delay: null, cleared: false, unref: false };
  const timer = { unref: () => { scheduler.unref = true; } };
  const options = {
    channel,
    schedule: (callback, delay) => {
      scheduler.callback = callback;
      scheduler.delay = delay;
      return timer;
    },
    cancel: value => {
      assert.equal(value, timer);
      scheduler.cleared = true;
    }
  };
  return { channel, options, scheduler };
}

test('child emits exact monotonically sequenced renewal messages', () => {
  const context = harness();
  const handle = controlLease.start(lineage, context.options);
  assert.equal(context.scheduler.delay, controlLease.RENEW_INTERVAL_MS);
  assert.equal(context.scheduler.unref, true);

  context.scheduler.callback();
  context.scheduler.callback();
  assert.deepEqual(context.channel.sent.map(message => message.sequence), [1, 2]);
  for (const message of context.channel.sent) {
    assert.deepEqual(Object.keys(message).sort(),
      ['lineage', 'protocolVersion', 'sequence', 'type']);
    assert.deepEqual(message.lineage, lineage);
  }
  handle.stop();
  assert.equal(context.scheduler.cleared, true);
  assert.equal(context.channel.listenerCount('disconnect'), 0);
});

test('disconnect and send errors stop the unreferenced renewal timer', () => {
  let context = harness();
  controlLease.start(lineage, context.options);
  context.channel.emit('disconnect');
  assert.equal(context.scheduler.cleared, true);
  assert.equal(context.channel.listenerCount('disconnect'), 0);
  context.scheduler.callback();
  assert.equal(context.channel.sent.length, 0);

  context = harness();
  context.channel.sendError = new Error('IPC closed');
  controlLease.start(lineage, context.options);
  context.scheduler.callback();
  assert.equal(context.scheduler.cleared, true);
  assert.equal(context.channel.listenerCount('disconnect'), 0);
});

test('child refuses incomplete renewal lineage', () => {
  const context = harness();
  assert.throws(() => controlLease.start({ ...lineage, threadId: '' }, context.options),
    /exact lineage/);
});
