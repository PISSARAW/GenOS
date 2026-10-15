'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const protocol = require('../src/services/runtimeControlReconnectProtocol');
const serverRuntime = require('../src/services/localRuntimeReconnectServer');
const reconnectClient = require('../src/services/runtimeControlReconnectClient');
const reassociation = require('../src/services/runtimeControlReassociation');
const recovery = require('../src/services/runtimeControlRecoveryBootstrap');
const cooperative = require('../src/services/cooperativeRuntimeControl');
const capability = require('../src/services/runtimeControlCapability');
const { RuntimeControlReconnectChannel } = require('../src/services/runtimeControlReconnectChannel');
const { activeProcesses } = require('../src/services/agentOrchestrationState');

const lineage = Object.freeze({
  workerId: 'worker-reconnect', missionId: 'mission-reconnect',
  episodeId: 'episode-reconnect', threadId: 'thread-reconnect',
  organizationId: 'org-reconnect', projectId: 'project-reconnect'
});

function keys() {
  return crypto.generateKeyPairSync('ed25519');
}

function ready(channel) {
  channel.send({
    type: capability.READY_TYPE, protocolVersion: capability.PROTOCOL_VERSION, lineage,
    actions: [...capability.ACTIONS]
  });
}

function waitFor(channel, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}.`)), 2000);
    channel.once(event, value => { clearTimeout(timer); resolve(value); });
  });
}

async function fixture() {
  const backend = keys();
  const runtime = await serverRuntime.start({
    lineage, backendPublicKey: backend.publicKey,
    onAttach: channel => ready(channel)
  });
  return { backend, runtime };
}

function connectRaw(descriptor) {
  const socket = net.connect(descriptor.endpoint);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(new RuntimeControlReconnectChannel(socket)));
    socket.once('error', reject);
  });
}

test('fresh backend reassociates a runtime through a new attested channel', async () => {
  const context = await fixture();
  activeProcesses.delete(lineage.workerId);
  try {
    const proof = await reassociation.reassociate({
      descriptor: context.runtime.descriptor, backendPrivateKey: context.backend.privateKey,
      expectedLineage: lineage
    });
    assert.deepEqual({ proven: proof.proven, code: proof.code, workerId: proof.workerId }, {
      proven: true, code: 'RUNTIME_CONTROL_REASSOCIATED', workerId: lineage.workerId
    });
    const channel = activeProcesses.get(lineage.workerId);
    assert.equal(channel.genosRuntimeInstanceId, context.runtime.descriptor.runtimeInstanceId);
    assert.notEqual(channel.constructor.name, 'ChildProcess');
  } finally {
    activeProcesses.get(lineage.workerId)?.destroy();
    activeProcesses.delete(lineage.workerId);
    await context.runtime.close();
  }
});

test('wrong backend key and modified process identity fail closed', async () => {
  const context = await fixture();
  try {
    await assert.rejects(reconnectClient.connect({
      descriptor: context.runtime.descriptor, backendPrivateKey: keys().privateKey,
      timeoutMs: 500
    }), /closed|invalid|failed|does not match/i);
    const forged = {
      ...context.runtime.descriptor,
      processIdentity: { ...context.runtime.descriptor.processIdentity, pid: process.pid + 1 }
    };
    await assert.rejects(reconnectClient.connect({
      descriptor: forged, backendPrivateKey: context.backend.privateKey, timeoutMs: 500
    }), /closed|invalid|failed/i);
  } finally { await context.runtime.close(); }
});

test('replayed reconnect challenge is refused', async () => {
  const context = await fixture();
  const challenge = protocol.createChallenge({
    descriptor: context.runtime.descriptor, backendPrivateKey: context.backend.privateKey
  });
  let first;
  let second;
  try {
    first = await connectRaw(context.runtime.descriptor);
    const response = waitFor(first, 'message');
    first.send(challenge);
    assert.equal(protocol.validResponse(await response, {
      challenge, descriptor: context.runtime.descriptor
    }), true);

    second = await connectRaw(context.runtime.descriptor);
    const closed = waitFor(second, 'close');
    second.send(challenge);
    await closed;
  } finally {
    first?.destroy();
    second?.destroy();
    await context.runtime.close();
  }
});

test('existing live owner prevents reassociation before network mutation', async () => {
  const context = await fixture();
  const existing = { connected: true, exitCode: null };
  activeProcesses.set(lineage.workerId, existing);
  try {
    await assert.rejects(reassociation.reassociate({
      descriptor: context.runtime.descriptor, backendPrivateKey: context.backend.privateKey,
      expectedLineage: lineage
    }), /already owns/);
    assert.equal(activeProcesses.get(lineage.workerId), existing);
  } finally {
    activeProcesses.delete(lineage.workerId);
    await context.runtime.close();
  }
});

test('expected authority rejects a cross-tenant descriptor before connection', async () => {
  const context = await fixture();
  try {
    await assert.rejects(reassociation.reassociate({
      descriptor: context.runtime.descriptor, backendPrivateKey: context.backend.privateKey,
      expectedLineage: { ...lineage, organizationId: 'org-other' }
    }), /expected authority/);
  } finally { await context.runtime.close(); }
});

test('reassociated proxy carries cooperative control acknowledgements', async () => {
  const backend = keys();
  const runtime = await serverRuntime.start({
    lineage, backendPublicKey: backend.publicKey,
    onAttach: channel => {
      channel.on('message', message => {
        if (message?.type !== 'genos-runtime-control-request') return;
        channel.send({
          type: 'genos-runtime-control-ack', requestId: message.requestId,
          action: message.action, lineage: message.lineage,
          proven: true, success: true, proofCode: 'REASSOCIATED_SAFE_POINT'
        });
      });
      ready(channel);
    }
  });
  activeProcesses.delete(lineage.workerId);
  try {
    await reassociation.reassociate({
      descriptor: runtime.descriptor, backendPrivateKey: backend.privateKey,
      expectedLineage: lineage
    });
    const proof = await cooperative.request({
      child: activeProcesses.get(lineage.workerId), action: 'pause', lineage
    });
    assert.deepEqual({ proven: proof.proven, code: proof.code },
      { proven: true, code: 'REASSOCIATED_SAFE_POINT' });
  } finally {
    activeProcesses.get(lineage.workerId)?.destroy();
    activeProcesses.delete(lineage.workerId);
    await runtime.close();
  }
});

test('recovery bootstrap requires durable authority records and signing key', async () => {
  const context = await fixture();
  activeProcesses.delete(lineage.workerId);
  const store = { listReconnectAuthorities: async () => [{
    id: 'authority-a', descriptor: context.runtime.descriptor, expectedLineage: lineage
  }] };
  try {
    const [result] = await recovery.recover({
      store, backendPrivateKey: context.backend.privateKey
    });
    assert.equal(result.code, 'RUNTIME_CONTROL_REASSOCIATED');
    await assert.rejects(recovery.recover({ store }), /durable backend signing key/);
  } finally {
    activeProcesses.get(lineage.workerId)?.destroy();
    activeProcesses.delete(lineage.workerId);
    await context.runtime.close();
  }
});

test('only one concurrent reassociation can acquire worker ownership', async () => {
  const context = await fixture();
  activeProcesses.delete(lineage.workerId);
  const input = {
    descriptor: context.runtime.descriptor, backendPrivateKey: context.backend.privateKey,
    expectedLineage: lineage
  };
  try {
    const results = await Promise.allSettled([
      reassociation.reassociate(input), reassociation.reassociate(input)
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.match(results.find(result => result.status === 'rejected').reason.message,
      /already in progress/);
  } finally {
    activeProcesses.get(lineage.workerId)?.destroy();
    activeProcesses.delete(lineage.workerId);
    await context.runtime.close();
  }
});
