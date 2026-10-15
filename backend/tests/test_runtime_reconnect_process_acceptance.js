'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { fork } = require('node:child_process');
const reassociation = require('../src/services/runtimeControlReassociation');
const reconnectClient = require('../src/services/runtimeControlReconnectClient');
const cooperative = require('../src/services/cooperativeRuntimeControl');
const { activeProcesses } = require('../src/services/agentOrchestrationState');

const helper = path.join(__dirname, 'helpers', 'runtime_reconnect_acceptance_child.cjs');
const lineage = Object.freeze({
  workerId: 'worker-reconnect-process', missionId: 'mission-reconnect-process',
  episodeId: 'episode-reconnect-process', threadId: 'thread-reconnect-process',
  organizationId: 'org-reconnect-process', projectId: 'project-reconnect-process'
});

function pem(key) {
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function waitFor(child, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Timed out waiting for runtime child.')), timeoutMs);
    const onMessage = message => { if (predicate(message)) done(null, message); };
    const onExit = () => done(new Error('Runtime child exited early.'));
    function done(error, value) {
      clearTimeout(timer);
      child.removeListener('message', onMessage);
      child.removeListener('exit', onExit);
      if (error) reject(error); else resolve(value);
    }
    child.on('message', onMessage);
    child.once('exit', onExit);
  });
}

async function runtimeFixture(options = {}) {
  const backend = crypto.generateKeyPairSync('ed25519');
  const child = fork(helper, [], { silent: true });
  const listening = waitFor(child, message => message?.type === 'fixture-runtime-listening');
  child.send({ type: 'fixture-start', lineage,
    backendPublicKey: pem(backend.publicKey), announceReady: options.announceReady });
  const { descriptor } = await listening;
  return { backend, child, descriptor };
}

function reconnect(state, overrides = {}) {
  return reassociation.reassociate({ descriptor: state.descriptor,
    backendPrivateKey: state.backend.privateKey, expectedLineage: lineage,
    timeoutMs: 500, readyTimeoutMs: 500, ...overrides });
}

async function cleanup(state) {
  activeProcesses.get(lineage.workerId)?.destroy();
  activeProcesses.delete(lineage.workerId);
  if (state.child.connected) {
    const exited = new Promise(resolve => state.child.once('exit', resolve));
    state.child.send({ type: 'fixture-close' });
    const timer = setTimeout(() => state.child.kill(), 500);
    await exited;
    clearTimeout(timer);
  }
}

test('a fresh backend replaces the old channel only after a new attestation', async () => {
  const state = await runtimeFixture();
  activeProcesses.delete(lineage.workerId);
  try {
    const first = await reconnect(state);
    assert.equal(first.proven, true);
    const oldChannel = activeProcesses.get(lineage.workerId);
    const oldClosed = new Promise(resolve => oldChannel.once('close', resolve));

    activeProcesses.delete(lineage.workerId);
    const second = await reconnect(state);
    await oldClosed;
    const current = activeProcesses.get(lineage.workerId);
    assert.equal(second.proven, true);
    assert.notEqual(current, oldChannel);
    assert.equal(oldChannel.connected, false);
    const proof = await cooperative.request({ child: current, action: 'pause', lineage });
    assert.deepEqual({ proven: proof.proven, code: proof.code },
      { proven: true, code: 'RECONNECTED_CHILD_SAFE_POINT' });
  } finally { await cleanup(state); }
});

test('a forged or recycled PID cannot reassociate the runtime', async () => {
  const state = await runtimeFixture();
  activeProcesses.delete(lineage.workerId);
  try {
    const forged = { ...state.descriptor, processIdentity: {
      ...state.descriptor.processIdentity, pid: state.descriptor.processIdentity.pid + 1 } };
    await assert.rejects(reconnect(state, { descriptor: forged }), /closed|invalid|failed/i);
    assert.equal(activeProcesses.has(lineage.workerId), false);
  } finally { await cleanup(state); }
});

test('mutual proof without activation cannot create an active owner', async () => {
  const state = await runtimeFixture();
  activeProcesses.delete(lineage.workerId);
  let channel;
  try {
    channel = await reconnectClient.connect({ descriptor: state.descriptor,
      backendPrivateKey: state.backend.privateKey, timeoutMs: 500 });
    assert.equal(channel.connected, true);
    assert.equal(activeProcesses.has(lineage.workerId), false);
    channel.destroy();
    const proof = await reconnect(state);
    assert.equal(proof.proven, true, 'a later fresh challenge may still recover');
  } finally {
    channel?.destroy();
    await cleanup(state);
  }
});

test('activation without a fresh ready announcement never reports success', async () => {
  const state = await runtimeFixture({ announceReady: false });
  activeProcesses.delete(lineage.workerId);
  try {
    await assert.rejects(reconnect(state), /readiness|closed/i);
    assert.equal(activeProcesses.has(lineage.workerId), false);
  } finally { await cleanup(state); }
});

test('cross-tenant authority and concurrent ownership fail closed', async () => {
  const state = await runtimeFixture();
  activeProcesses.delete(lineage.workerId);
  try {
    await assert.rejects(reconnect(state, {
      expectedLineage: { ...lineage, organizationId: 'org-other' }
    }), /expected authority/);
    const contenders = await Promise.allSettled([reconnect(state), reconnect(state)]);
    assert.equal(contenders.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(contenders.filter(item => item.status === 'rejected').length, 1);
    assert.equal(activeProcesses.get(lineage.workerId)?.connected, true);
  } finally { await cleanup(state); }
});
