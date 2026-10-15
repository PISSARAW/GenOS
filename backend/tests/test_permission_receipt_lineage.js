'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
process.env.GENOS_TOOL_MEMBRANE_HMAC_SECRET ||= 'permission-lineage-test-secret-32-bytes';
const { migratePermissionReceiptLineage } = require('../src/db/migrations/migratePermissionReceiptLineage');
const episodes = require('../src/services/missionEpisodeService');
const threads = require('../src/services/cellThreadService');
const bridge = require('../src/services/mcpExecutor/permissionMembraneBridge');

const SCOPE = { organizationId: 'org-lineage', projectId: 'project-lineage' };

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE missions (
      mission_id TEXT PRIMARY KEY, objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    INSERT INTO missions VALUES ('mission-lineage', 'Lineage', 'active');
    INSERT INTO missions VALUES ('mission-other', 'Other', 'active');`);
  await migratePermissionReceiptLineage(db);
  await seedCell(db, { missionId: 'mission-lineage', episodeId: 'episode-lineage',
    threadId: 'thread-lineage' });
  await seedCell(db, { missionId: 'mission-other', episodeId: 'episode-other',
    threadId: 'thread-other' });
  return db;
}

async function seedCell(db, input) {
  await episodes.create(db, { ...SCOPE, missionId: input.missionId,
    episodeId: input.episodeId, organismRevision: 'organism-r1' });
  await threads.create(db, { ...SCOPE, missionId: input.missionId,
    episodeId: input.episodeId, threadId: input.threadId,
    workerId: 'worker-lineage', cellKind: 'orchestrator' });
}

function binding(overrides = {}) {
  return { status: 'authorized', hash: 'authority-lineage', envelope: {
    runId: 'run-lineage', missionId: 'mission-lineage', toolLease: ['genos_snapshot'],
    scope: { ...SCOPE, entityId: 'worker-lineage' }, ...overrides
  } };
}

function context(db, overrides = {}) {
  const request = { ...SCOPE, callId: 'call-lineage', agentId: 'worker-lineage',
    runId: 'run-lineage', missionId: 'mission-lineage', episodeId: 'episode-lineage',
    threadId: 'thread-lineage', toolName: 'genos_snapshot', args: { safe: true },
    ...(overrides.request || {}) };
  return { db, request, binding: overrides.binding || binding(),
    policy: { decision: 'allow', reason: 'lineage-test' },
    operation: async () => ({ success: true, status: 'completed' }) };
}

test('bridge persists an immutable backend-issued receipt lineage', async () => {
  const db = await fixture();
  try {
    const result = await bridge.executeAuthorized(context(db));
    assert.deepEqual(result.permissionReceipt.lineage, { exact: true,
      missionId: 'mission-lineage', episodeId: 'episode-lineage',
      threadId: 'thread-lineage' });
    const row = await db.get('SELECT * FROM tool_permission_receipt_lineage');
    assert.equal(row.worker_id, 'worker-lineage');
    assert.equal(row.organization_id, SCOPE.organizationId);
    assert.match(row.lineage_hash, /^[a-f0-9]{64}$/);
    await assert.rejects(db.run(`UPDATE tool_permission_receipt_lineage
      SET thread_id = 'thread-other' WHERE receipt_id = ?`, row.receipt_id),
    /TOOL_PERMISSION_LINEAGE_IMMUTABLE/);
  } finally { await db.close(); }
});

test('bridge rejects cross-scope, worker and thread selectors before authorization', async () => {
  const db = await fixture();
  try {
    await assert.rejects(bridge.executeAuthorized(context(db, { request: {
      projectId: 'project-foreign' } })),
    error => error.code === 'TOOL_MEMBRANE_LINEAGE_SCOPE_COLLISION');
    await assert.rejects(bridge.executeAuthorized(context(db, { request: {
      callId: 'call-mission-collision', missionId: 'mission-other' } })),
    error => error.code === 'TOOL_MEMBRANE_LINEAGE_SCOPE_COLLISION');
    await assert.rejects(bridge.executeAuthorized(context(db, { request: {
      callId: 'call-worker-collision' }, binding: binding({ scope: {
        ...SCOPE, entityId: 'worker-foreign' } }) })),
    error => error.code === 'TOOL_MEMBRANE_LINEAGE_WORKER_COLLISION');
    await assert.rejects(bridge.executeAuthorized(context(db, { request: {
      callId: 'call-thread-collision', threadId: 'thread-other' } })),
    error => error.code === 'TOOL_MEMBRANE_LINEAGE_THREAD_COLLISION');
    const count = await db.get('SELECT COUNT(*) AS count FROM tool_permission_receipts');
    assert.equal(count.count, 0);
  } finally { await db.close(); }
});

test('legacy authorization remains explicitly uncorrelated', async () => {
  const db = await fixture();
  try {
    const runtime = context(db, { request: { callId: 'call-legacy' } });
    runtime.binding = { status: 'legacy_unbound' };
    const result = await bridge.executeAuthorized(runtime);
    assert.deepEqual(result.permissionReceipt.lineage,
      { exact: false, reason: 'execution_authority_unbound' });
    const count = await db.get('SELECT COUNT(*) AS count FROM tool_permission_receipt_lineage');
    assert.equal(count.count, 0);
  } finally { await db.close(); }
});
