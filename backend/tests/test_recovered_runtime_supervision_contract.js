'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const protocol = require('../src/services/recoveredRuntimeSupervisionProtocol');
const publisherFactory = require('../src/services/recoveredRuntimeSupervisionPublisher');
const supervisorFactory = require('../src/services/recoveredRuntimeSupervisor');

const lineage = Object.freeze({ workerId: 'worker-contract', missionId: 'mission-contract',
  episodeId: 'episode-contract', threadId: 'thread-contract', organizationId: 'org-contract',
  projectId: 'project-contract' });
const descriptor = Object.freeze({ runtimeInstanceId: crypto.randomUUID(), lineage });

class Channel extends EventEmitter {
  constructor() { super(); this.connected = true; this.destroyed = false; }
  send(message) { this.emit('sent', message); return true; }
  destroy() {
    this.destroyed = true;
    this.connected = false;
    this.emit('close');
  }
}

function frame(overrides = {}) {
  return protocol.create({ epoch: overrides.epoch || crypto.randomUUID(),
    sequence: overrides.sequence || 1,
    runtimeInstanceId: overrides.runtimeInstanceId || descriptor.runtimeInstanceId,
    lineage: overrides.lineage || lineage, kind: overrides.kind || 'event',
    payload: overrides.payload || { name: 'progress', detail: { step: 1 } } });
}

test('replay, cross-tenant and oversized frames fail closed', () => {
  const replayChannel = new Channel();
  const replay = supervisorFactory.attach({ channel: replayChannel, ...descriptor });
  const first = frame();
  replayChannel.emit('message', first);
  replayChannel.emit('message', first);
  assert.equal(replayChannel.destroyed, true);
  assert.equal(replay.lastSequence, 1);

  const tenantChannel = new Channel();
  supervisorFactory.attach({ channel: tenantChannel, ...descriptor });
  tenantChannel.emit('message', frame({ lineage: { ...lineage, organizationId: 'other-org' } }));
  assert.equal(tenantChannel.destroyed, true);

  const publishChannel = new Channel();
  const publisher = publisherFactory.create(descriptor);
  publisher.attach(publishChannel);
  assert.equal(publisher.publish('stdout', { text: 'x'.repeat(33 * 1024) }), false);
  assert.equal(publishChannel.destroyed, false);
});

test('channel loss is not reported as process exit or terminal success', async () => {
  const channel = new Channel();
  const supervisor = supervisorFactory.attach({ channel, ...descriptor });
  const lost = new Promise(resolve => supervisor.events.once('lost', resolve));
  channel.destroy();
  assert.deepEqual(await lost, { terminalDeclared: false, lastSequence: 0 });
  assert.equal(supervisor.terminalDeclaration, null);
  assert.equal(supervisor.capabilities.processExit, false);
  assert.equal('exitCode' in supervisor, false);
  assert.equal('kill' in supervisor, false);
});
