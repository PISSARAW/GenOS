'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { fork } = require('node:child_process');
const cooperative = require('../src/services/cooperativeRuntimeControl');
const capability = require('../src/services/runtimeControlCapability');
const { canonicalJson } = require('../src/services/aTeam/variants/variantExecutionHelpers');

const helper = path.join(__dirname, 'helpers', 'cooperative_runtime_child.cjs');
const lineage = Object.freeze({
  workerId: 'worker-e2e', missionId: 'mission-e2e', episodeId: 'episode-e2e',
  threadId: 'thread-e2e', organizationId: 'org-e2e', projectId: 'project-e2e'
});
const TIMEOUT_MS = 3000;

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function spawnRuntime() {
  const child = fork(helper, [], { silent: true });
  child.genosControlIdentity = lineage;
  capability.bind(child);
  return child;
}

function waitFor(child, predicate, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Timed out waiting for child message.')), timeoutMs);
    const onMessage = message => {
      if (predicate(message)) done(null, message);
    };
    const onExit = (code, signal) => done(new Error(`Child exited early (${code}/${signal}).`));
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

async function ready(child) {
  const announced = waitFor(child, message => message?.type === 'genos-runtime-control-ready');
  child.send({ type: 'fixture-bind' });
  return announced;
}

function request(child, action, overrides = {}) {
  return cooperative.request({
    child, action, lineage: overrides.lineage || lineage,
    checkpoint: overrides.checkpoint, timeoutMs: overrides.timeoutMs || 1000
  });
}

function safePoint(child, callId, phase = 'prepared') {
  const result = waitFor(child, message => message?.callId === callId
    && message.type.startsWith('fixture-safe-point-'));
  child.send({ type: 'fixture-reach-safe-point', callId, phase });
  return result;
}

function observe(child, callId) {
  const result = waitFor(child, message => message?.type === 'fixture-observation'
    && message.callId === callId);
  child.send({ type: 'fixture-observe', callId });
  return result;
}

async function closeChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (child.connected) child.disconnect();
  const timer = setTimeout(() => child.kill(), 250);
  await exited;
  clearTimeout(timer);
}

function checkpoint(overrides = {}) {
  const context = {
    kind: 'genos-local-runtime-control', phase: 'prepared',
    promptHash: sha256('deterministic cooperative runtime prompt'), version: 1
  };
  return {
    checkpointId: 'checkpoint-e2e', checkpointHash: sha256('checkpoint-e2e'),
    contextHash: sha256(canonicalJson(context)), context,
    contextSize: Buffer.byteLength(canonicalJson(context)), evidenceRefs: ['evidence:e2e'],
    ...overrides
  };
}

test('real child advertises the exact cooperative protocol and capabilities', async () => {
  const child = spawnRuntime();
  try {
    const announced = await ready(child);
    assert.deepEqual(announced, {
      type: 'genos-runtime-control-ready', protocolVersion: 1,
      lineage, actions: ['pause', 'resume', 'cancel', 'resume_checkpoint']
    });
  } finally { await closeChild(child); }
});

test('pause ACK waits for a safe point and resume releases work', async () => {
  const child = spawnRuntime();
  try {
    await ready(child);
    let pauseSettled = false;
    const pausing = request(child, 'pause').then(value => {
      pauseSettled = true;
      return value;
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(pauseSettled, false, 'pause must not ACK before a safe point');
    const work = safePoint(child, 'pause-cycle');
    const paused = await pausing;
    assert.equal(paused.proven, true);
    assert.equal(paused.code, 'RUNTIME_PAUSED_AT_SAFE_POINT');
    await assertPending(work, 'paused work must remain blocked');
    const resumed = await request(child, 'resume');
    assert.equal(resumed.proven, true);
    assert.equal(resumed.code, 'RUNTIME_RESUMED');
    const completed = await work;
    assert.equal(completed.type, 'fixture-safe-point-returned');
    assert.equal(completed.workUnits, 1);
  } finally { await closeChild(child); }
});

async function assertPending(promise, message) {
  const marker = Symbol('pending');
  const result = await Promise.race([
    promise, new Promise(resolve => setTimeout(() => resolve(marker), 50))
  ]);
  assert.equal(result, marker, message);
}

test('cross-tenant lineage and stale request ids cannot prove control', async () => {
  const child = spawnRuntime();
  try {
    await ready(child);
    const wrong = await request(child, 'pause', {
      lineage: { ...lineage, organizationId: 'org-other' }, timeoutMs: 250
    });
    assert.equal(wrong.proven, false);

    const pausing = request(child, 'pause');
    await assertPending(pausing, 'a divergent request id must be ignored');
    const work = safePoint(child, 'stale-ack');
    assert.equal((await pausing).proven, true);
    assert.equal((await request(child, 'resume')).proven, true);
    await work;
  } finally { await closeChild(child); }
});

test('checkpoint resume restores observable state and rejects incoherent context', async () => {
  const child = spawnRuntime();
  try {
    await ready(child);
    const restoring = request(child, 'resume_checkpoint', { checkpoint: checkpoint() });
    const work = safePoint(child, 'checkpoint');
    const restored = await restoring;
    assert.equal(restored.proven, true);
    const completed = await work;
    assert.deepEqual(completed.resumeCheckpoint, { phase: 'prepared', reply: null });

    const invalid = checkpoint({ contextHash: sha256('other-context') });
    const refused = await request(child, 'resume_checkpoint', {
      checkpoint: invalid, timeoutMs: 250
    });
    assert.equal(refused.proven, false);
    const observation = await observe(child, 'after-invalid');
    assert.deepEqual(observation.resumeCheckpoint, { phase: 'prepared', reply: null });
  } finally { await closeChild(child); }
});

test('prepared checkpoint is refused at a generated safe point', async () => {
  const child = spawnRuntime();
  try {
    await ready(child);
    const restoring = request(child, 'resume_checkpoint', {
      checkpoint: checkpoint(), timeoutMs: 250
    });
    const generated = await safePoint(child, 'generated-checkpoint', 'generated');
    assert.equal(generated.type, 'fixture-safe-point-returned');
    const refused = await restoring;
    assert.equal(refused.proven, false);
    const observation = await observe(child, 'after-generated');
    assert.equal(observation.resumeCheckpoint, null);
  } finally { await closeChild(child); }
});

test('cancel ACK waits for a safe point and disconnect releases the child cleanly', async () => {
  const child = spawnRuntime();
  try {
    await ready(child);
    const cancelling = request(child, 'cancel');
    await assertPending(cancelling, 'cancel must not ACK before a safe point');
    const work = safePoint(child, 'cancel');
    const cancelled = await cancelling;
    assert.equal(cancelled.proven, true);
    assert.equal(cancelled.code, 'RUNTIME_CANCEL_ACKNOWLEDGED_AT_SAFE_POINT');
    await assertPending(work, 'cancelled safe point waits for shutdown');
    const before = await observe(child, 'listeners');
    assert.deepEqual(
      [before.messageListeners, before.disconnectListeners], [2, 2],
      'child control requests must not leak listeners'
    );
    assert.deepEqual(
      ['message', 'close', 'disconnect'].map(name => child.listenerCount(name)),
      [2, 1, 1],
      'parent exchanges must leave only capability and the pending fixture waiter'
    );
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.disconnect();
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    await exited;
    clearTimeout(timer);
  } finally { await closeChild(child); }
});
