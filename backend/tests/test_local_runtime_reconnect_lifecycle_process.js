'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { fork } = require('node:child_process');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const migration = require('../src/db/migrations/migrateRuntimeControlReconnectAuthorities');
const storeFactory = require('../src/services/runtimeControlAuthorityStore');
const provisioning = require('../src/services/runtimeControlReconnectProvisioning');
const protocol = require('../src/services/runtimeControlReconnectProtocol');

const helper = path.join(__dirname, 'helpers', 'local_runtime_reconnect_lifecycle_child.cjs');
const lineage = Object.freeze({ workerId: 'worker-lifecycle', missionId: 'mission-lifecycle',
  episodeId: 'episode-lifecycle', threadId: 'thread-lifecycle',
  organizationId: 'org-lifecycle', projectId: 'project-lifecycle' });

function waitMessage(child, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Lifecycle child timed out.')), 5000);
    child.on('message', message => {
      if (message?.type !== type) return;
      clearTimeout(timer);
      resolve(message);
    });
    child.once('exit', code => reject(new Error(`Lifecycle child exited (${code}).`)));
  });
}

test('real local child persists descriptor without receiving backend private key', async () => {
  const backend = crypto.generateKeyPairSync('ed25519');
  const publicKey = backend.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migration.migrateRuntimeControlReconnectAuthorities(db);
  const child = fork(helper, [], { silent: true, env: { ...process.env,
    GENOS_TEST_LINEAGE: Buffer.from(JSON.stringify(lineage)).toString('base64url'),
    GENOS_RUNTIME_CONTROL_LINEAGE_B64:
      Buffer.from(JSON.stringify(lineage)).toString('base64url'),
    GENOS_RUNTIME_CONTROL_BACKEND_PUBLIC_B64: Buffer.from(publicKey).toString('base64url'),
    GENOS_RUNTIME_CONTROL_BACKEND_KEY_ID: protocol.keyId(publicKey) } });
  const cleanup = provisioning.attach({ db, child, identity: lineage,
    authority: { keyId: protocol.keyId(publicKey) } });
  try {
    const started = await waitMessage(child, 'fixture-runtime-reconnect-started');
    assert.equal(started.privateKeyVisible, false);
    assert.equal(started.lineageMatchesMission, false);
    assert.deepEqual(started.descriptor.lineage, lineage);
    assert.equal(started.descriptor.backendKeyId, protocol.keyId(publicKey));
    assert.equal((await storeFactory.create(db).listReconnectAuthorities()).length, 1);
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.send({ type: 'fixture-shutdown' });
    await exited;
    await cleanup();
    assert.equal((await storeFactory.create(db).listReconnectAuthorities()).length, 0);
  } finally {
    await cleanup().catch(() => {});
    if (child.exitCode === null) child.kill('SIGKILL');
    await db.close();
  }
});
