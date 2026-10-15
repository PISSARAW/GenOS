'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { fork } = require('node:child_process');
const reassociation = require('../src/services/runtimeControlReassociation');
const cooperative = require('../src/services/cooperativeRuntimeControl');
const capability = require('../src/services/runtimeControlCapability');
const { activeProcesses } = require('../src/services/agentOrchestrationState');

const helper = path.join(__dirname, 'helpers', 'reconnectable_cooperative_runtime.cjs');
const lineage = Object.freeze({
  workerId: 'worker-restart-e2e', missionId: 'mission-restart-e2e',
  episodeId: 'episode-restart-e2e', threadId: 'thread-restart-e2e',
  organizationId: 'org-restart-e2e', projectId: 'project-restart-e2e'
});

function publicPem(key) {
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function waitMessage(child, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Fixture message timed out.')), 5000);
    const onMessage = message => { if (predicate(message)) done(null, message); };
    const onExit = code => done(new Error(`Fixture exited early (${code}).`));
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

function stop(child) {
  return new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 2000).unref();
  });
}

test('surviving runtime reattaches after original IPC is lost', async () => {
  const backend = crypto.generateKeyPairSync('ed25519');
  const config = Buffer.from(JSON.stringify({
    lineage, backendPublicKey: publicPem(backend.publicKey)
  })).toString('base64url');
  const child = fork(helper, [], {
    silent: true, env: { ...process.env, GENOS_RECONNECT_FIXTURE: config }
  });
  child.genosControlIdentity = lineage;
  capability.bind(child);
  activeProcesses.delete(lineage.workerId);
  try {
    const descriptorMessage = waitMessage(child,
      message => message?.type === 'fixture-reconnect-descriptor');
    const initialReady = waitMessage(child, message => message?.type === capability.READY_TYPE);
    const [stored] = await Promise.all([descriptorMessage, initialReady]);
    const initialPause = await cooperative.request({ child, action: 'pause', lineage });
    assert.equal(initialPause.code, 'RUNTIME_PAUSED_AT_SAFE_POINT');
    child.disconnect();
    const proof = await reassociation.reassociate({
      descriptor: stored.descriptor, expectedLineage: lineage,
      backendPrivateKey: backend.privateKey
    });
    assert.equal(proof.code, 'RUNTIME_CONTROL_REASSOCIATED');
    const channel = activeProcesses.get(lineage.workerId);
    const resumedAcrossRestart = await cooperative.request({ child: channel, action: 'resume', lineage });
    assert.equal(resumedAcrossRestart.code, 'RUNTIME_RESUMED');
    const paused = await cooperative.request({ child: channel, action: 'pause', lineage });
    assert.equal(paused.proven, true, JSON.stringify(paused));
    assert.equal(paused.code, 'RUNTIME_PAUSED_AT_SAFE_POINT');
    const resumed = await cooperative.request({ child: channel, action: 'resume', lineage });
    assert.equal(resumed.proven, true);
    assert.equal(resumed.code, 'RUNTIME_RESUMED');
  } finally {
    activeProcesses.get(lineage.workerId)?.destroy();
    activeProcesses.delete(lineage.workerId);
    await stop(child);
  }
});
