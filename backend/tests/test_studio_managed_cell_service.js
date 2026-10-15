'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const checkpoints = require('../src/services/cellThreadCheckpointService');
const controls = require('../src/services/operatorControlCommandService');
const serviceModule = require('../src/services/studioManagedCellService');
const { migrateOperatorControlReceipts } =
  require('../src/db/migrations/migrateOperatorControlReceipts');

const SCOPE = { organizationId: 'org-a', projectId: 'project-a' };
const PATH = { missionId: 'mission-a', episodeId: 'episode-a', threadId: 'thread-a' };

function proofRuntime() {
  return { apply: async entry => ({ proven: true,
    code: `${entry.action.toUpperCase()}_ACK`, detail: 'unit proof' }) };
}

function checkpointProof(request) {
  return { proven: true, proofCode: 'CHECKPOINT_ACK',
    checkpointId: request.checkpointId, checkpointHash: request.checkpointHash,
    contextHash: request.contextHash, missionId: request.missionId,
    episodeId: request.episodeId, threadId: request.threadId,
    workerId: request.workerId, organizationId: request.organizationId,
    projectId: request.projectId };
}

function nativeCapture() {
  return { proven: true, proofCode: 'RUNTIME_GENERATED_CHECKPOINT_CAPTURED',
    context: { kind: 'genos-local-runtime', version: 1, phase: 'generated',
      promptHash: 'a'.repeat(64), reply: 'captured reply' },
    evidenceRefs: ['runtime-context:sha256:native'] };
}

function service(runtime = { resume: async request => checkpointProof(request),
  capture: async () => nativeCapture() }) {
  return serviceModule.create({ checkpointRuntime: runtime,
    commands: { execute: (db, input) => controls.execute(db, input,
      { runtimeControl: proofRuntime() }) } });
}

async function fixture(status = 'waiting_signal') {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY);
    CREATE TABLE access_keys (
      id TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
      role TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT '["read"]',
      expires_at DATETIME, is_active INTEGER DEFAULT 1
    );
    INSERT INTO missions VALUES ('mission-a');
    INSERT INTO access_keys (id, key_hash, label, role, permissions)
      VALUES ('operator-a', 'hash-a', 'Operator A', 'operator',
        '["read","workspace:write","emergency_kill"]'),
        ('viewer-a', 'hash-v', 'Viewer A', 'viewer', '["read"]');`);
  await migrateOperatorControlReceipts(db);
  await db.run(`INSERT INTO mission_episodes
    (episode_id, mission_id, organization_id, project_id, organism_revision, status)
    VALUES ('episode-a', 'mission-a', 'org-a', 'project-a', 'organism:1', 'active')`);
  await db.run(`INSERT INTO cell_threads
    (thread_id, episode_id, mission_id, organization_id, project_id,
      worker_id, cell_kind, status, revision)
    VALUES ('thread-a', 'episode-a', 'mission-a', 'org-a', 'project-a',
      'worker-persisted', 'worker', ?, 0)`, status);
  return db;
}

function input(body = {}, overrides = {}) {
  return { scope: SCOPE, ...PATH, actorId: 'operator-a', authMethod: 'access_key',
    body: { idempotencyKey: 'managed-key-1', ...body }, ...overrides };
}

test('checkpoint seal resolves worker from the CellThread and is tenant-bound', async () => {
  const db = await fixture();
  try {
    const api = service();
    const request = input({ context: { cursor: 4 }, evidenceRefs: ['evidence:1'],
      workerId: 'worker-forged' });
    const first = await api.sealCheckpoint(db, request);
    const retry = await api.sealCheckpoint(db, request);
    assert.equal(first.checkpoint.workerId, 'worker-persisted');
    assert.equal(first.checkpoint.context.reply, 'captured reply');
    assert.deepEqual(first.checkpoint.evidenceRefs, ['runtime-context:sha256:native']);
    assert.equal(retry.idempotent, true);
    assert.equal(retry.checkpoint.checkpointId, first.checkpoint.checkpointId);
    await assert.rejects(api.readCheckpoint(db, { ...input(),
      scope: { organizationId: 'org-other', projectId: 'project-a' },
      checkpointId: first.checkpoint.checkpointId }),
    error => error.code === 'CELL_THREAD_SCOPE_DENIED');
    await assert.rejects(api.sealCheckpoint(db, input({
      idempotencyKey: 'x'.repeat(201), context: {} })),
    error => error.code === 'STUDIO_CELL_IDEMPOTENCY_INVALID');
  } finally { await db.close(); }
});

test('control ignores forged actor, persists idempotence and rechecks read scope', async () => {
  const db = await fixture('active');
  try {
    const api = service();
    const request = input({ actorId: 'viewer-a', reason: 'operator pause' },
      { action: 'pause' });
    const first = await api.control(db, request);
    const retry = await api.control(db, request);
    assert.equal(first.command.actorId, 'operator-a');
    assert.equal(first.receipt.outcome, 'applied');
    assert.equal(retry.command.commandId, first.command.commandId);
    const changes = (await db.get('SELECT total_changes() AS count')).count;
    const read = await api.readCommand(db, { ...input(), commandId: first.command.commandId });
    assert.equal(read.receipt.receiptId, first.receipt.receiptId);
    assert.equal((await db.get('SELECT total_changes() AS count')).count, changes);
    await assert.rejects(api.readCommand(db, { ...input(), episodeId: 'episode-other',
      commandId: first.command.commandId }),
    error => error.code === 'STUDIO_CELL_EPISODE_MISMATCH');
  } finally { await db.close(); }
});

test('managed mutations fail closed for sessions, missing privilege and runtime', async () => {
  const db = await fixture();
  try {
    const api = service({ resume: async () => ({ proven: false,
      code: 'RUNTIME_UNAVAILABLE' }), capture: async () => nativeCapture() });
    await assert.rejects(api.sealCheckpoint(db, input({ context: {} }, {
      authMethod: 'session' })),
    error => error.code === 'STUDIO_CELL_ACCESS_KEY_REQUIRED');
    await assert.rejects(api.control(db, input({}, { action: 'resume',
      authMethod: 'session' })),
    error => error.code === 'STUDIO_CELL_ACCESS_KEY_REQUIRED');
    await assert.rejects(api.control(db, input({}, { action: 'resume',
      authMethod: 'session', threadId: 'thread-does-not-exist' })),
    error => error.code === 'STUDIO_CELL_ACCESS_KEY_REQUIRED');
    await assert.rejects(api.control(db, input({}, { action: 'cancel',
      actorId: 'viewer-a' })), error => error.code === 'AUTHORITY_DENIED');
    const sealed = await api.sealCheckpoint(db, input({ context: { cursor: 9 } }));
    await assert.rejects(api.resumeCheckpoint(db, { ...input(),
      authMethod: 'session', checkpointId: sealed.checkpoint.checkpointId }),
    error => error.code === 'STUDIO_CELL_ACCESS_KEY_REQUIRED');
    await assert.rejects(api.resumeCheckpoint(db, { ...input(),
      checkpointId: sealed.checkpoint.checkpointId }),
    error => error.code === 'CELL_CHECKPOINT_RESUME_UNPROVEN');
    const row = await db.get("SELECT status, revision FROM cell_threads WHERE thread_id = 'thread-a'");
    assert.deepEqual(row, { status: 'waiting_signal', revision: 0 });
  } finally { await db.close(); }
});

test('checkpoint mutations reject an inactive access key', async () => {
  const db = await fixture();
  try {
    await db.run("UPDATE access_keys SET is_active = 0 WHERE id = 'operator-a'");
    await assert.rejects(service().sealCheckpoint(db, input({ context: {} })),
      error => error.code === 'STUDIO_CELL_ACCESS_KEY_REQUIRED' && error.status === 403);
  } finally { await db.close(); }
});

test('manual checkpoint is only a fallback when no live runtime exists', async () => {
  const db = await fixture();
  try {
    const api = service({ resume: async request => checkpointProof(request),
      capture: async () => ({ proven: false, code: 'RUNTIME_UNAVAILABLE' }) });
    const fallback = await api.sealCheckpoint(db, input({ context: { cursor: 21 },
      evidenceRefs: ['manual:evidence'] }));
    assert.deepEqual(fallback.checkpoint.context, { cursor: 21 });
    await assert.rejects(api.sealCheckpoint(db, input({ idempotencyKey: 'no-context' })),
      error => error.code === 'RUNTIME_UNAVAILABLE');
  } finally { await db.close(); }
});

test('an applied receipt requiring reconciliation is never returned as success', async () => {
  const db = await fixture('active');
  try {
    const resultCode = 'CONTROL_APPLIED_RECONCILIATION_REQUIRED';
    const api = serviceModule.create({ commands: { execute: async () => ({
      command: { status: 'applied', resultCode },
      receipt: { outcome: 'applied', resultCode }
    }) } });
    await assert.rejects(api.control(db, input({}, { action: 'pause' })),
      error => error.code === resultCode && error.status === 409);
  } finally { await db.close(); }
});

test('exact checkpoint GET returns filtered context without database writes', async () => {
  const db = await fixture();
  try {
    const api = service();
    const sealed = await api.sealCheckpoint(db, input({ context: { cursor: 12 } }));
    const changes = (await db.get('SELECT total_changes() AS count')).count;
    const read = await api.readCheckpoint(db, { ...input(),
      checkpointId: sealed.checkpoint.checkpointId });
    assert.equal(read.context.reply, 'captured reply');
    assert.equal((await db.get('SELECT total_changes() AS count')).count, changes);
    const ignored = await api.sealCheckpoint(db, input({ idempotencyKey: 'secret-key',
      context: { accessToken: 'forbidden' }, evidenceRefs: ['client:forged'] }));
    assert.equal(ignored.checkpoint.context.reply, 'captured reply');
    assert.deepEqual(ignored.checkpoint.evidenceRefs, ['runtime-context:sha256:native']);
  } finally { await db.close(); }
});
