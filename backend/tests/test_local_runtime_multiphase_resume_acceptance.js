'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { fork } = require('node:child_process');
const cooperative = require('../src/services/cooperativeRuntimeControl');
const capability = require('../src/services/runtimeControlCapability');
const { canonicalJson } = require('../src/services/aTeam/variants/variantExecutionHelpers');

const helper = path.join(__dirname, 'helpers', 'cooperative_multiphase_child.cjs');
const lineage = Object.freeze({
  workerId: 'worker-multiphase', missionId: 'mission-multiphase',
  episodeId: 'episode-multiphase', threadId: 'thread-multiphase',
  organizationId: 'org-multiphase', projectId: 'project-multiphase'
});
const prompt = 'multiphase deterministic prompt';
const TIMEOUT_MS = 3000;

function hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256(value) {
  return `sha256:${hex(value)}`;
}

function waitFor(child, predicate, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Timed out waiting for child message.')), timeoutMs);
    const onMessage = message => { if (predicate(message)) done(null, message); };
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

function spawnRuntime() {
  const child = fork(helper, [], { silent: true });
  child.genosControlIdentity = lineage;
  capability.bind(child);
  return child;
}

async function ready(child) {
  const message = waitFor(child, item => item?.type === 'genos-runtime-control-ready');
  child.send({ type: 'fixture-bind' });
  await message;
}

async function closeChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (child.connected) child.disconnect();
  const timer = setTimeout(() => child.kill(), 250);
  await exited;
  clearTimeout(timer);
}

function context(phase = 'generated', reply = 'reply-restored-from-checkpoint') {
  return { kind: 'genos-local-runtime', version: 1, phase,
    promptHash: hex(prompt), reply };
}

function checkpoint(runtimeContext, overrides = {}) {
  const json = canonicalJson(runtimeContext);
  return { checkpointId: 'checkpoint-multiphase',
    checkpointHash: sha256('checkpoint-multiphase'),
    contextHash: sha256(json), context: runtimeContext,
    contextSize: Buffer.byteLength(JSON.stringify(runtimeContext)),
    evidenceRefs: ['evidence:multiphase'], ...overrides };
}

function request(child, material, timeoutMs = 500) {
  return cooperative.request({ child, action: 'resume_checkpoint', lineage,
    checkpoint: material, timeoutMs });
}

function runPipeline(child, callId) {
  const completed = waitFor(child, message => message?.callId === callId
    && message.type.startsWith('fixture-pipeline-'));
  child.send({ type: 'fixture-run-pipeline', callId });
  return completed;
}

test('generated resume supplies the reply actually consumed after the prepared safe point', async () => {
  const child = spawnRuntime();
  try {
    await ready(child);
    const restoring = request(child, checkpoint(context()));
    const pipeline = runPipeline(child, 'generated-consumed');
    const proof = await restoring;
    const result = await pipeline;
    assert.equal(proof.proven, true);
    assert.equal(proof.code, 'RUNTIME_CHECKPOINT_APPLIED');
    assert.equal(result.type, 'fixture-pipeline-complete');
    assert.equal(result.consumedReply, 'reply-restored-from-checkpoint');
    assert.equal(result.generatedCalls, 0, 'restored generation must not call the model again');
    assert.equal(result.evaluatedCalls, 1, 'the unevaluated reply must still enter evaluation');
    assert.deepEqual(result.resumeCheckpoint,
      { phase: 'generated', reply: 'reply-restored-from-checkpoint' });
  } finally { await closeChild(child); }
});

async function refusedContext(runtimeContext, overrides, callId) {
  const child = spawnRuntime();
  try {
    await ready(child);
    const restoring = request(child, checkpoint(runtimeContext, overrides), 250);
    const pipeline = runPipeline(child, callId);
    const proof = await restoring;
    const result = await pipeline;
    assert.equal(proof.proven, false);
    assert.equal(result.consumedReply, 'reply-created-after-safe-point');
    assert.equal(result.generatedCalls, 1);
    assert.equal(result.resumeCheckpoint, null);
  } finally { await closeChild(child); }
}

test('evaluated live resume is refused because external effects may already exist', async () => {
  await refusedContext(context('evaluated'), {}, 'evaluated-refused');
});

test('divergent prompt and context hashes cannot inject a generated reply', async t => {
  await t.test('prompt hash', () => refusedContext(
    { ...context(), promptHash: hex('different prompt') }, {}, 'prompt-refused'));
  await t.test('context hash', () => refusedContext(
    context(), { contextHash: sha256('different context') }, 'context-refused'));
});

test('oversized generated replies fail closed before they can be consumed', async () => {
  const child = spawnRuntime();
  try {
    await ready(child);
    const oversized = checkpoint(context('generated', 'x'.repeat(256 * 1024)));
    const proof = await request(child, oversized, 250);
    const result = await runPipeline(child, 'oversize-refused');
    assert.equal(proof.proven, false);
    assert.equal(proof.code, 'RUNTIME_CHECKPOINT_INVALID');
    assert.equal(result.consumedReply, 'reply-created-after-safe-point');
    assert.equal(result.resumeCheckpoint, null);
  } finally { await closeChild(child); }
});
