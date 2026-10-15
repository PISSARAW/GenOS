'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');

const runtimeHelper = path.join(__dirname, 'helpers', 'recovered_supervision_runtime.cjs');
const backendHelper = path.join(__dirname, 'helpers', 'recovered_supervision_backend.cjs');
const lineage = Object.freeze({ workerId: 'worker-supervision-restart',
  missionId: 'mission-supervision-restart', episodeId: 'episode-supervision-restart',
  threadId: 'thread-supervision-restart', organizationId: 'org-supervision-restart',
  projectId: 'project-supervision-restart' });

function pem(key, type) { return key.export({ type, format: 'pem' }).toString(); }

function waitMessage(child, predicate, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Process message timed out.')), timeoutMs);
    const onMessage = message => { if (predicate(message)) done(null, message); };
    const onExit = code => {
      const peers = (child.genosPeers || []).map(peer =>
        `${peer.genosLabel}[exit=${peer.exitCode}]: ${peer.genosStderr}`).join(' | ');
      done(new Error(`${child.genosLabel} exited early (${code}): ${child.genosStderr} ${peers}`));
    };
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

function spawnFixture(spec) {
  const child = fork(spec.helper, [], { silent: true, env: { ...process.env,
    [spec.environment]: Buffer.from(JSON.stringify(spec.value)).toString('base64url') } });
  child.genosLabel = spec.label;
  child.genosStderr = '';
  child.stderr.on('data', chunk => {
    child.genosStderr = `${child.genosStderr}${chunk}`.slice(-4000);
  });
  return child;
}

function stop(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve();
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    child.once('exit', done);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 1500).unref();
    setTimeout(done, 4000).unref();
  });
}

test('backend restart recovers bounded future supervision without faking ChildProcess',
  { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-recovered-supervision-'));
  const database = path.join(root, 'authority.sqlite');
  const privateKey = path.join(root, 'backend-ed25519.pem');
  const keys = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(privateKey, pem(keys.privateKey, 'pkcs8'), { mode: 0o600 });
  const runtime = spawnFixture({ helper: runtimeHelper, environment: 'GENOS_RECOVERED_RUNTIME',
    value: { lineage, backendPublicKey: pem(keys.publicKey, 'spki') }, label: 'runtime' });
  let firstBackend;
  let secondBackend;
  try {
    const { descriptor } = await waitMessage(runtime, message => message?.type === 'descriptor');
    firstBackend = spawnFixture({ helper: backendHelper, environment: 'GENOS_RECOVERED_BACKEND',
      value: { database, privateKey, lineage, descriptor }, label: 'backend-1' });
    firstBackend.genosPeers = [runtime];
    await waitMessage(firstBackend, message => message?.type === 'recovered');
    await stop(firstBackend);

    secondBackend = spawnFixture({ helper: backendHelper, environment: 'GENOS_RECOVERED_BACKEND',
      value: { database, privateKey, lineage }, label: 'backend-2' });
    secondBackend.genosPeers = [runtime];
    const recovered = await waitMessage(secondBackend, message => message?.type === 'recovered');
    assert.equal(recovered.capabilities.historicalLogs, false);
    assert.equal(recovered.capabilities.processExit, false);
    assert.equal(recovered.capabilities.fullContext, false);
    assert.equal(recovered.capabilities.cpuBudget, false);
    assert.equal(recovered.hasChildStreams, false);

    const expected = [
      ['stdout', { text: 'future stdout\n' }],
      ['stderr', { text: 'future stderr\n' }],
      ['event', { name: 'progress', detail: { step: 2 } }],
      ['terminal', { state: 'completed', detail: { receipt: 'runtime-declared' } }]
    ];
    for (let index = 0; index < expected.length; index += 1) {
      const [kind, payload] = expected[index];
      const observed = waitMessage(secondBackend,
        message => message?.type === 'supervision' && message.kind === kind);
      runtime.send({ type: 'publish', id: index, kind, payload });
      assert.deepEqual((await observed).payload, payload);
    }

    const revoked = waitMessage(secondBackend, message => message?.type === 'revoked');
    secondBackend.send({ type: 'revoke' });
    assert.deepEqual(await revoked, { type: 'revoked', status: 'revoked', remaining: 0 });
    await stop(runtime);
  } finally {
    await Promise.all([stop(firstBackend), stop(secondBackend), stop(runtime)]);
    fs.rmSync(root, { recursive: true, force: true });
  }
  });
