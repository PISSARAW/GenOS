'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const authority = require('../src/services/runtimeControlSigningAuthority');
const provisioning = require('../src/services/runtimeControlReconnectProvisioning');
const protocol = require('../src/services/runtimeControlReconnectProtocol');
const migration = require('../src/db/migrations/migrateRuntimeControlReconnectAuthorities');
const storeFactory = require('../src/services/runtimeControlAuthorityStore');

const lineage = Object.freeze({ workerId: 'worker-key', missionId: 'mission-key',
  episodeId: 'episode-key', threadId: 'thread-key', organizationId: 'org-key',
  projectId: 'project-key' });

function keyFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-runtime-key-'));
  const filename = path.join(directory, 'backend-ed25519.pem');
  const keys = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(filename, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 });
  const keyId = protocol.keyId(keys.publicKey);
  return { directory, filename, keyId, keys,
    environment: { [authority.FILE_ENV]: filename, [authority.ID_ENV]: keyId } };
}

function descriptor(keys) {
  const runtime = crypto.generateKeyPairSync('ed25519');
  return protocol.descriptor({ endpoint: { host: '127.0.0.1', port: 43111 },
    runtimeInstanceId: crypto.randomUUID(), lineage,
    processIdentity: { pid: 4040, startMarker: crypto.randomUUID() },
    runtimePublicKey: runtime.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    backendKeyId: protocol.keyId(keys.publicKey) });
}

test('durable Ed25519 authority validates explicit key id and rotation', () => {
  const fixture = keyFixture();
  try {
    const loaded = authority.load(fixture.environment);
    assert.equal(loaded.keyId, fixture.keyId);
    assert.equal(loaded.privateKey.asymmetricKeyType, 'ed25519');
    assert.equal(protocol.keyId(loaded.publicKey), fixture.keyId);
    assert.throws(() => authority.load({ ...fixture.environment,
      [authority.ID_ENV]: `sha256:${'0'.repeat(64)}` }), /rotation is unacknowledged/);
    assert.throws(() => authority.load({ [authority.FILE_ENV]: fixture.filename }),
      /incomplete/);
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('only local runtime receives public reconnect material', () => {
  const fixture = keyFixture();
  const beforeFile = process.env[authority.FILE_ENV];
  const beforeId = process.env[authority.ID_ENV];
  try {
    process.env[authority.FILE_ENV] = fixture.filename;
    process.env[authority.ID_ENV] = fixture.keyId;
    assert.deepEqual(provisioning.prepare(false, lineage), { authority: null, environment: {} });
    const prepared = provisioning.prepare(true, lineage);
    assert.equal(prepared.authority.keyId, fixture.keyId);
    assert.equal(prepared.environment.GENOS_RUNTIME_CONTROL_BACKEND_KEY_ID, fixture.keyId);
    assert.deepEqual(JSON.parse(Buffer.from(
      prepared.environment.GENOS_RUNTIME_CONTROL_LINEAGE_B64, 'base64url').toString()), lineage);
    assert.equal(JSON.stringify(prepared.environment).includes('PRIVATE KEY'), false);
    assert.throws(() => provisioning.prepare(true, { ...lineage, unexpected: true }),
      /control identity is incomplete/);
  } finally {
    if (beforeFile === undefined) delete process.env[authority.FILE_ENV];
    else process.env[authority.FILE_ENV] = beforeFile;
    if (beforeId === undefined) delete process.env[authority.ID_ENV];
    else process.env[authority.ID_ENV] = beforeId;
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('descriptor ACK follows durable save and close revokes authority', async () => {
  const fixture = keyFixture();
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migration.migrateRuntimeControlReconnectAuthorities(db);
  const child = new EventEmitter();
  child.connected = true;
  child.sent = [];
  child.send = message => child.sent.push(message);
  const context = { db, child, identity: lineage, authority: authority.load(fixture.environment) };
  const cleanup = provisioning.attach(context);
  try {
    child.emit('message', { type: provisioning.DESCRIPTOR_TYPE,
      requestId: crypto.randomUUID(), descriptor: descriptor(fixture.keys) });
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(child.sent[0].code, 'RECONNECT_DESCRIPTOR_DURABLE');
    assert.equal((await storeFactory.create(db).listReconnectAuthorities()).length, 1);
    child.emit('close');
    await cleanup();
    assert.equal((await storeFactory.create(db).listReconnectAuthorities()).length, 0);
  } finally {
    await cleanup().catch(() => {});
    await db.close();
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});
