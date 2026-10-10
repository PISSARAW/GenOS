'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const { createRuntime } = require('../src/services/cognitiveOmegaRuntimeService');
const interop = require('../src/services/cognitiveOmegaInteropService');
const scientific = require('../src/services/cognitiveScientificReferenceVisibility');
const ledger = require('../src/services/cognitivePersistentVisibilityLedger');

const ref = { organizationId: 'org-1', projectId: 'project-1', workspaceId: 'workspace-1',
  objectType: 'theorem', objectId: 'proof-1', version: 2 };
const uri = scientific.formatReference(ref);
const content = 'theorem exact bytes\nλ';
const digest = `sha256:${createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex')}`;
const operations = [
  { id: 'read_science', kind: 'READ', reference: uri, dependsOn: [] },
  { id: 'infer', kind: 'INFER', reference: 'model/test', dependsOn: ['read_science'] }
];
const policy = { read: [uri], infer: ['model/test'] };

async function execute(db, extra = {}) {
  let inferenceCalls = 0;
  const runtime = createRuntime();
  runtime.registerInferer('model/test', ({ input }) => { inferenceCalls += 1; return input; });
  const result = await runtime.execute({ operations, policy, context: {
    db, sessionId: 'session-1', organizationId: ref.organizationId,
    projectId: ref.projectId, workspaceId: ref.workspaceId, ...extra
  } });
  return { result, inferenceCalls };
}

(async () => {
  const envelope = { schema: interop.SCHEMA, version: 1, id: 'science-read', operations,
    policy, payload: null };
  assert.equal(interop.validate(envelope).valid, true);
  assert.equal(interop.decode(interop.encode(envelope)).operations[0].reference, uri);
  assert.deepEqual(scientific.parseReference(uri), ref);
  assert.throws(() => scientific.parseReference(`${uri}=`), /malformed/);

  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const resolver = { resolveReference: async (_, query) => {
    assert.deepEqual(query, { ref, requesterScope: { organizationId: ref.organizationId,
      projectId: ref.projectId, workspaceId: ref.workspaceId } });
    return { status: 'resolved', ref, version: ref.version, content, digest };
  } };
  const missingStore = await execute(db);
  assert.equal(missingStore.result.reason, 'scientific_runtime_unavailable');
  assert.equal(missingStore.inferenceCalls, 0);
  const missingScope = await execute(db, { workspaceId: null, scientificReferenceStore: resolver });
  assert.equal(missingScope.result.reason, 'scientific_scope_required');
  assert.equal(missingScope.inferenceCalls, 0);
  const mismatched = await execute(db, { scientificReferenceStore: {
    resolveReference: async () => ({ status: 'resolved', ref, version: ref.version, content,
      digest: `sha256:${'0'.repeat(64)}` })
  } });
  assert.equal(mismatched.result.reason, 'scientific_content_digest_mismatch');
  assert.equal(mismatched.inferenceCalls, 0);
  assert.equal((await ledger.recover(db, 'session-1'))?.fragments.length || 0, 0);

  const success = await execute(db, { scientificReferenceStore: resolver });
  assert.equal(success.result.status, 'emitted');
  assert.equal(success.inferenceCalls, 1);
  assert.equal(success.result.values.read_science.content, content);
  assert.equal(success.result.values.read_science.digest, digest);
  const fragment = await db.get(`SELECT scope FROM cognitive_visibility_fragments
    WHERE session_id = ? AND object_id = ?`, ['session-1', uri]);
  const visible = await ledger.visible(db, { sessionId: 'session-1', objectId: uri, scope: fragment.scope });
  assert.equal(visible.visible, true);
  assert.deepEqual(visible.value, success.result.values.read_science);

  const refV1 = { ...ref, version: 1 };
  const uriV1 = scientific.formatReference(refV1);
  const versionedStore = { resolveReference: async (_, query) => ({
    status: 'resolved', ref: query.ref, version: query.ref.version, content,
    digest
  }) };
  const readVersion = async (sessionId, versionUri, scopedDb = db) => createRuntime().execute({
    operations: [{ id: 'read_version', kind: 'READ', reference: versionUri, dependsOn: [] }],
    policy: { read: [versionUri] }, context: { db: scopedDb, sessionId,
      organizationId: ref.organizationId, projectId: ref.projectId,
      workspaceId: ref.workspaceId, scientificReferenceStore: versionedStore }
  });
  assert.equal((await readVersion('session-1', uriV1)).status, 'emitted');
  assert.equal((await readVersion('session-2', uriV1)).status, 'emitted');
  assert.equal((await readVersion('session-2', uri)).status, 'emitted');
  const invalidated = await scientific.invalidateReference(db, { uri: uriV1, reason: 'verified_retraction' });
  assert.deepEqual(invalidated.sessionIds.sort(), ['session-1', 'session-2']);
  for (const sessionId of invalidated.sessionIds) {
    const row = await db.get(`SELECT scope FROM cognitive_visibility_fragments
      WHERE session_id = ? AND object_id = ?`, [sessionId, uriV1]);
    assert.equal((await ledger.visible(db, { sessionId, objectId: uriV1, scope: row.scope })).visible, false);
  }
  const v2Row = await db.get(`SELECT scope FROM cognitive_visibility_fragments
    WHERE session_id = ? AND object_id = ?`, ['session-2', uri]);
  assert.equal((await ledger.visible(db, { sessionId: 'session-2', objectId: uri,
    scope: v2Row.scope })).visible, true);

  const failingDb = { exec: (...args) => db.exec(...args), get: (...args) => db.get(...args),
    all: (...args) => db.all(...args), run: (sql, ...args) => {
      if (sql.includes('INSERT INTO cognitive_visibility_events')) throw new Error('forced_event_failure');
      return db.run(sql, ...args);
    } };
  const failed = await readVersion('session-failed', uriV1, failingDb);
  assert.equal(failed.status, 'blocked');
  const leftover = await db.get(`SELECT COUNT(*) AS count FROM cognitive_visibility_fragments
    WHERE session_id = ?`, 'session-failed');
  assert.equal(leftover.count, 0);
  await db.close();
  console.log('G-CIR scientific reference visibility checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
