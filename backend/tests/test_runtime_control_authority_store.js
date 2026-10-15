'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const migration = require('../src/db/migrations/migrateRuntimeControlReconnectAuthorities');
const authorityStore = require('../src/services/runtimeControlAuthorityStore');
const protocol = require('../src/services/runtimeControlReconnectProtocol');
const { recoverRuntimeControlAtStartup } = require('../server');

const lineage = Object.freeze({
  workerId: 'worker-store', missionId: 'mission-store', episodeId: 'episode-store',
  threadId: 'thread-store', organizationId: 'org-store', projectId: 'project-store'
});

function pem(key, type) {
  return key.export({ format: 'pem', type }).toString();
}

function descriptor(backend, overrides = {}) {
  const runtime = crypto.generateKeyPairSync('ed25519');
  return protocol.descriptor({
    endpoint: { host: '127.0.0.1', port: overrides.port || 43555 },
    runtimeInstanceId: overrides.runtimeInstanceId || crypto.randomUUID(),
    lineage: overrides.lineage || lineage,
    processIdentity: { pid: overrides.pid || 4242,
      startMarker: overrides.startMarker || crypto.randomUUID() },
    runtimePublicKey: pem(runtime.publicKey, 'spki'),
    backendKeyId: protocol.keyId(backend.publicKey)
  });
}

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migration.migrateRuntimeControlReconnectAuthorities(db);
  return { db, store: authorityStore.create(db) };
}

test('migration and store seal exact authorities idempotently and revoke with CAS', async () => {
  const backend = crypto.generateKeyPairSync('ed25519');
  const state = await fixture();
  try {
    await migration.migrateRuntimeControlReconnectAuthorities(state.db);
    const reconnect = descriptor(backend);
    const first = await state.store.saveReconnectAuthority({ descriptor: reconnect });
    const retry = await state.store.saveReconnectAuthority({ descriptor: reconnect });
    assert.equal(first.status, 'recoverable');
    assert.equal(first.revision, 1);
    assert.equal(first.idempotent, false);
    assert.equal(retry.id, first.id);
    assert.equal(retry.idempotent, true);
    assert.deepEqual((await state.store.listReconnectAuthorities())[0].expectedLineage, lineage);

    await assert.rejects(state.store.saveReconnectAuthority({
      descriptor: descriptor(backend, { port: 43556 })
    }), error => error.code === 'RUNTIME_RECONNECT_AUTHORITY_CONFLICT');
    await assert.rejects(state.store.revokeReconnectAuthority({ id: first.id,
      expectedRevision: 2, lineage, reason: 'runtime stopped' }),
    error => error.code === 'RUNTIME_RECONNECT_REVISION_CONFLICT');
    const revoked = await state.store.revokeReconnectAuthority({ id: first.id,
      expectedRevision: 1, lineage, reason: 'runtime stopped' });
    assert.deepEqual({ status: revoked.status, revision: revoked.revision,
      idempotent: revoked.idempotent }, { status: 'revoked', revision: 2,
      idempotent: false });
    const replay = await state.store.revokeReconnectAuthority({ id: first.id,
      expectedRevision: 1, lineage, reason: 'runtime stopped' });
    assert.equal(replay.idempotent, true);
    assert.deepEqual(await state.store.listReconnectAuthorities(), []);
    await assert.rejects(state.db.run(`DELETE FROM runtime_control_reconnect_authorities
      WHERE authority_id = ?`, first.id), /RUNTIME_RECONNECT_AUTHORITY_IMMUTABLE/);
  } finally { await state.db.close(); }
});

test('store refuses malformed descriptors, scope divergence and forged rows', async () => {
  const backend = crypto.generateKeyPairSync('ed25519');
  const state = await fixture();
  try {
    await assert.rejects(state.store.saveReconnectAuthority({ descriptor: { forged: true } }),
      error => error.code === 'RUNTIME_RECONNECT_DESCRIPTOR_INVALID');
    const saved = await state.store.saveReconnectAuthority({ descriptor: descriptor(backend) });
    await assert.rejects(state.store.revokeReconnectAuthority({ id: saved.id,
      expectedRevision: 1, lineage: { ...lineage, projectId: 'project-other' },
      reason: 'wrong scope' }),
    error => error.code === 'RUNTIME_RECONNECT_AUTHORITY_SCOPE_MISMATCH');
    await state.db.exec('DROP TRIGGER runtime_reconnect_authority_update_guard');
    await state.db.run(`UPDATE runtime_control_reconnect_authorities
      SET descriptor_hash = ? WHERE authority_id = ?`, `sha256:${'0'.repeat(64)}`, saved.id);
    await assert.rejects(state.store.listReconnectAuthorities(),
      error => error.code === 'RUNTIME_RECONNECT_AUTHORITY_INTEGRITY');
  } finally { await state.db.close(); }
});

test('a fresh database connection recovers the sealed authority after restart', async () => {
  const backend = crypto.generateKeyPairSync('ed25519');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-reconnect-store-'));
  const filename = path.join(directory, 'runtime.db');
  let db = await open({ filename, driver: sqlite3.Database });
  try {
    await migration.migrateRuntimeControlReconnectAuthorities(db);
    const reconnect = descriptor(backend);
    const saved = await authorityStore.create(db)
      .saveReconnectAuthority({ descriptor: reconnect });
    await db.close();
    db = await open({ filename, driver: sqlite3.Database });
    const [restored] = await authorityStore.create(db).listReconnectAuthorities();
    assert.equal(restored.id, saved.id);
    assert.equal(restored.revision, 1);
    assert.equal(restored.descriptor.runtimeInstanceId, reconnect.runtimeInstanceId);
    assert.deepEqual(restored.expectedLineage, lineage);
  } finally {
    await db.close().catch(() => {});
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('startup sweep is explicitly gated and needs a matching durable Ed25519 key', async () => {
  const backend = crypto.generateKeyPairSync('ed25519');
  const state = await fixture();
  try {
    const disabled = await recoverRuntimeControlAtStartup(state.db, {
      env: {}, store: { listReconnectAuthorities: async () => { throw new Error('called'); } }
    });
    assert.equal(disabled.enabled, false);
    const empty = await recoverRuntimeControlAtStartup(state.db, {
      env: { GENOS_RUNTIME_RECONNECT_RECOVERY_ENABLED: '1' }, store: state.store
    });
    assert.deepEqual({ attempted: empty.attempted, recovered: empty.recovered },
      { attempted: 0, recovered: 0 });

    const reconnect = descriptor(backend);
    await state.store.saveReconnectAuthority({ descriptor: reconnect });
    await assert.rejects(recoverRuntimeControlAtStartup(state.db, {
      env: { GENOS_RUNTIME_RECONNECT_RECOVERY_ENABLED: '1' }, store: state.store
    }), error => error.code === 'RUNTIME_RECONNECT_BACKEND_KEY_INVALID');
    await assert.rejects(recoverRuntimeControlAtStartup(state.db, {
      env: { GENOS_RUNTIME_RECONNECT_RECOVERY_ENABLED: '1' }, store: state.store,
      signingAuthority: { load: () => ({
        privateKey: crypto.generateKeyPairSync('ed25519').privateKey
      }) }
    }), error => error.code === 'RUNTIME_RECONNECT_BACKEND_KEY_INVALID');

    let received;
    const result = await recoverRuntimeControlAtStartup(state.db, {
      env: { GENOS_RUNTIME_RECONNECT_RECOVERY_ENABLED: '1' }, store: state.store,
      signingAuthority: { load: () => ({ privateKey: backend.privateKey }) },
      reassociate: async input => {
        received = input;
        return { proven: true, code: 'RUNTIME_CONTROL_REASSOCIATED' };
      }
    });
    assert.deepEqual({ attempted: result.attempted, recovered: result.recovered },
      { attempted: 1, recovered: 1 });
    assert.deepEqual(received.expectedLineage, lineage);
    assert.equal(received.descriptor.runtimeInstanceId, reconnect.runtimeInstanceId);
  } finally { await state.db.close(); }
});
