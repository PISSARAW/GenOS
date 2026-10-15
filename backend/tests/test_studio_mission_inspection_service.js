'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
process.env.GENOS_TOOL_MEMBRANE_HMAC_SECRET ||= 'studio-inspection-service-secret-32-bytes';
const { migrateMissionEpisodes } = require('../src/db/migrations/migrateMissionEpisodes');
const { migrateHabitatRevisions } = require('../src/db/migrations/migrateHabitatRevisions');
const { migrateMetabolicLedger } = require('../src/db/migrations/migrateMetabolicLedger');
const { migrateMetabolicLedgerCellLineage } = require('../src/db/migrations/migrateMetabolicLedgerCellLineage');
const { migrateMissionEpisodeRecovery } = require('../src/db/migrations/migrateMissionEpisodeRecovery');
const { migrateToolPermissionMembrane } = require('../src/db/migrations/migrateToolPermissionMembrane');
const { migratePermissionReceiptLineage } = require('../src/db/migrations/migratePermissionReceiptLineage');
const { migrateCellThreadCheckpoints } = require('../src/db/migrations/migrateCellThreadCheckpoints');
const { migrateOperatorControlReceipts } = require('../src/db/migrations/migrateOperatorControlReceipts');
const episodes = require('../src/services/missionEpisodeService');
const threads = require('../src/services/cellThreadService');
const habitats = require('../src/services/habitatRevisionService');
const ledger = require('../src/services/metabolicLedgerService');
const membrane = require('../src/services/toolPermissionMembraneService');
const bridge = require('../src/services/mcpExecutor/permissionMembraneBridge');
const inspection = require('../src/services/studioMissionInspectionService');

const SCOPE = { organizationId: 'org-inspection', projectId: 'project-inspection' };

function habitatConfiguration() {
  return {
    runtimeKind: 'process', imageDigest: null,
    filesystemPolicy: { type: 'workspace_copy', readOnlyRoot: false },
    networkPolicy: { type: 'none', allowedHosts: [] },
    limits: { wallClockMs: 30000 }, secretBrokerPolicy: { type: 'unavailable' },
    mountedResources: [], isolationAssertions: { process: 'declared' }
  };
}

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE missions (
      mission_id TEXT PRIMARY KEY, objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    INSERT INTO missions VALUES ('mission-inspection', 'Inspect', 'active');`);
  await migrateMissionEpisodes(db);
  await migrateHabitatRevisions(db);
  await migrateMetabolicLedger(db);
  await migrateMetabolicLedgerCellLineage(db);
  await migrateMissionEpisodeRecovery(db);
  await migrateToolPermissionMembrane(db);
  await migratePermissionReceiptLineage(db);
  await migrateCellThreadCheckpoints(db);
  await migrateOperatorControlReceipts(db);
  return db;
}

function authorityBinding(workerId) {
  return { status: 'authorized', hash: `authority-${workerId}`, envelope: {
    runId: `run-${workerId}`, missionId: 'mission-inspection',
    toolLease: ['genos_snapshot'], scope: { ...SCOPE, entityId: workerId }
  } };
}

async function exactPermission(db, input) {
  return bridge.executeAuthorized({ db, binding: authorityBinding(input.workerId),
    request: { ...SCOPE, missionId: 'mission-inspection', episodeId: 'episode-inspection',
      callId: input.callId, agentId: input.workerId, runId: `run-${input.workerId}`,
      threadId: input.threadId, toolName: 'genos_snapshot', args: { safe: true } },
    policy: { decision: 'allow', reason: 'inspection_test' },
    operation: async () => ({ success: true, status: 'completed' }) });
}

async function seed(db) {
  await episodes.create(db, { ...SCOPE, missionId: 'mission-inspection',
    episodeId: 'episode-inspection', organismRevision: 'organism-r1' });
  await episodes.create(db, { ...SCOPE, missionId: 'mission-inspection',
    episodeId: 'episode-other', organismRevision: 'organism-r1' });
  await threads.create(db, { ...SCOPE, missionId: 'mission-inspection',
    episodeId: 'episode-inspection', threadId: 'thread-root', workerId: 'worker-root',
    cellKind: 'orchestrator' });
  for (const suffix of ['a', 'b']) {
    await threads.create(db, { ...SCOPE, missionId: 'mission-inspection',
      episodeId: 'episode-inspection', threadId: `thread-${suffix}`,
      parentThreadId: 'thread-root', workerId: `worker-${suffix}`, cellKind: 'worker' });
  }
  await habitats.registerRevision(db, { ...SCOPE, habitatId: 'habitat-inspection',
    expectedRevision: 0, configuration: habitatConfiguration() });
  await habitats.bindMission(db, { ...SCOPE, missionId: 'mission-inspection',
    habitatId: 'habitat-inspection', revision: 1 });
  await ledger.recordMetabolicObservation(db, { ...SCOPE, id: 'observation-local',
    missionId: 'mission-inspection', episodeId: 'episode-inspection',
    threadId: 'thread-root', workerId: 'worker-root',
    measurements: { inputTokens: { value: 12, source: 'exact' },
      billableTokens: { value: 0, source: 'exact' },
      outputTokens: { source: 'unavailable', unavailableReason: 'provider omitted usage' } } });
  await ledger.recordMetabolicObservation(db, { ...SCOPE, id: 'observation-local-unknown',
    missionId: 'mission-inspection', episodeId: 'episode-inspection',
    threadId: 'thread-root', workerId: 'worker-root',
    measurements: { billableTokens: { source: 'unavailable',
      unavailableReason: 'provider omitted usage' } } });
  await ledger.recordMetabolicObservation(db, { ...SCOPE, id: 'observation-local-a',
    missionId: 'mission-inspection', episodeId: 'episode-inspection',
    threadId: 'thread-a', workerId: 'worker-a',
    measurements: { inputTokens: { value: 3, source: 'exact' } } });
  await ledger.recordMetabolicObservation(db, { ...SCOPE, id: 'observation-legacy',
    missionId: 'mission-inspection',
    measurements: { wallTimeMs: { value: 1, source: 'exact' } } });
  await ledger.recordMetabolicObservation(db, { ...SCOPE, id: 'observation-other-episode',
    missionId: 'mission-inspection', episodeId: 'episode-other',
    threadId: 'thread-other', workerId: 'worker-other',
    measurements: { activeTimeMs: { value: 777, source: 'exact' } } });
  await ledger.recordMetabolicObservation(db, { organizationId: 'org-foreign',
    projectId: 'project-foreign', id: 'observation-foreign', missionId: 'mission-inspection',
    episodeId: 'episode-inspection', threadId: 'thread-foreign', workerId: 'worker-foreign',
    measurements: { inputTokens: { value: 999, source: 'exact' } } });
  await db.run(`INSERT INTO mission_episode_recovery_receipts (
      receipt_id, episode_id, mission_id, organization_id, project_id,
      owner_agent_id, owner_run_id, owner_pid, runtime_pid, authority_generation,
      authority_token_hash, observed_authority_state, observed_run_status,
      outcome, quarantined_threads
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  'recovery-inspection', 'episode-inspection', 'mission-inspection',
  SCOPE.organizationId, SCOPE.projectId, 'worker-root', 'run-root', 101, 202, 3,
  'authority-hash', 'running', 'running', 'interrupted_quarantined', 2);
  await db.run(`INSERT INTO mission_episode_recovery_receipts (
      receipt_id, episode_id, mission_id, organization_id, project_id,
      owner_agent_id, owner_run_id, owner_pid, runtime_pid, authority_generation,
      authority_token_hash, observed_authority_state, observed_run_status,
      outcome, quarantined_threads
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  'recovery-inspection-latest', 'episode-inspection', 'mission-inspection',
  SCOPE.organizationId, SCOPE.projectId, 'worker-root', 'run-latest', 101, 202, 4,
  'authority-hash-latest', 'running', 'running', 'interrupted_quarantined', 1);
  await exactPermission(db, { callId: 'permission-local-root',
    workerId: 'worker-root', threadId: 'thread-root' });
  await exactPermission(db, { callId: 'permission-local-a',
    workerId: 'worker-a', threadId: 'thread-a' });
  await membrane.authorizeToolCall(db, permission('permission-legacy-local', SCOPE));
  await membrane.authorizeToolCall(db, permission('permission-foreign', {
    organizationId: 'org-foreign', projectId: 'project-foreign'
  }));
}

function permission(callId, scope) {
  return {
    callId, tool: { name: 'genos_snapshot', version: '1' }, arguments: { safe: true },
    worker: { id: 'worker-root', revision: 'worker-r1' },
    lease: { id: 'lease-inspection', tools: ['genos_snapshot'] },
    policy: { id: 'policy-inspection', version: '1', decision: 'allow' },
    authorityChecks: [{ source: 'worker-contract', decision: 'allow', deciderId: 'runtime' }],
    ...scope
  };
}

function context(overrides = {}) {
  return { scope: SCOPE, missionId: 'mission-inspection', episodeId: 'episode-inspection',
    query: {}, ...overrides };
}

async function seedCellOperations(db) {
  await threads.create(db, { ...SCOPE, missionId: 'mission-inspection',
    episodeId: 'episode-other', threadId: 'thread-other', workerId: 'worker-other',
    cellKind: 'orchestrator' });
  const foreign = { organizationId: 'org-foreign', projectId: 'project-foreign' };
  await db.run(`INSERT INTO missions VALUES ('mission-foreign', 'Foreign', 'active')`);
  await episodes.create(db, { ...foreign, missionId: 'mission-foreign',
    episodeId: 'episode-foreign', organismRevision: 'organism-r1' });
  await threads.create(db, { ...foreign, missionId: 'mission-foreign',
    episodeId: 'episode-foreign', threadId: 'thread-foreign', workerId: 'worker-foreign',
    cellKind: 'orchestrator' });
  await db.exec(`UPDATE cell_threads SET status='ready', revision=1 WHERE thread_id='thread-root';
    UPDATE cell_threads SET status='waiting_signal', revision=1 WHERE thread_id='thread-a';
    UPDATE cell_threads SET status='ready', revision=1 WHERE thread_id='thread-b';
    INSERT INTO cell_thread_checkpoints VALUES
      ('cp-1','mission-inspection','episode-inspection','thread-root','worker-root',
       'org-inspection','project-inspection',1,'ready','{"safe":1}',10,'ctx-1','[]','cp-hash-1','2026-01-01 00:00:01'),
      ('cp-2','mission-inspection','episode-inspection','thread-a','worker-a',
       'org-inspection','project-inspection',1,'waiting_signal','{"safe":2}',10,'ctx-2','[]','cp-hash-2','2026-01-01 00:00:02'),
      ('cp-3','mission-inspection','episode-inspection','thread-b','worker-b',
       'org-inspection','project-inspection',1,'ready','{"safe":3}',10,'ctx-3','[]','cp-hash-3','2026-01-01 00:00:03');
    UPDATE cell_threads SET status='active', revision=2 WHERE thread_id='thread-a';
    INSERT INTO cell_thread_checkpoint_resumptions VALUES
      ('resume-2','cp-2','mission-inspection','episode-inspection','thread-a','worker-a',
       'org-inspection','project-inspection',1,2,'waiting_signal','active','proof-secret',
       'proof-hash-secret','2026-01-01 00:01:02');
    INSERT INTO operator_control_commands
      (command_id,idempotency_key,request_hash,action,mission_id,episode_id,thread_id,
       organization_id,project_id,actor_id,authority,reason,expected_thread_revision,
       owner_token,lease_expires_at,status,result_code,revision,created_at,finalized_at) VALUES
      ('cmd-1','idem-1','request-secret-1','pause','mission-inspection','episode-inspection',
       'thread-root','org-inspection','project-inspection','actor','admin','reason',1,
       'owner-secret-1',9999999999999,'pending',NULL,0,'2026-01-01 00:02:01',NULL),
      ('cmd-2','idem-2','request-secret-2','resume','mission-inspection','episode-inspection',
       'thread-a','org-inspection','project-inspection','actor','admin','reason',1,
       'owner-secret-2',0,'applied','CONTROL_PROVEN',1,'2026-01-01 00:02:02','2026-01-01 00:03:02'),
      ('cmd-3','idem-3','request-secret-3','cancel','mission-inspection','episode-inspection',
       'thread-b','org-inspection','project-inspection','actor','admin','reason',1,
       'owner-secret-3',0,'applied','CONTROL_APPLIED_RECONCILIATION_REQUIRED',1,
       '2026-01-01 00:02:03','2026-01-01 00:03:03');
    INSERT INTO operator_control_receipts VALUES
      ('receipt-2','cmd-2','applied','CONTROL_PROVEN','{"authorityToken":"hidden"}',
       'receipt-hash-2','2026-01-01 00:03:02'),
      ('receipt-3','cmd-3','applied','CONTROL_APPLIED_RECONCILIATION_REQUIRED',
       '{"ownerToken":"hidden"}','receipt-hash-3','2026-01-01 00:03:03');`);
  await db.exec(`UPDATE cell_threads SET status='ready', revision=1
      WHERE thread_id IN ('thread-other','thread-foreign');
    INSERT INTO cell_thread_checkpoints VALUES
      ('cp-other','mission-inspection','episode-other','thread-other','worker-other',
       'org-inspection','project-inspection',1,'ready','{}',2,'ctx-o','[]','cp-hash-o','2026-01-01'),
      ('cp-foreign','mission-foreign','episode-foreign','thread-foreign','worker-foreign',
       'org-foreign','project-foreign',1,'ready','{}',2,'ctx-f','[]','cp-hash-f','2026-01-01');
    INSERT INTO operator_control_commands
      (command_id,idempotency_key,request_hash,action,mission_id,episode_id,thread_id,
       organization_id,project_id,actor_id,authority,expected_thread_revision,owner_token,
       lease_expires_at,status) VALUES
      ('cmd-other','idem-o','req-o','pause','mission-inspection','episode-other','thread-other',
       'org-inspection','project-inspection','actor','admin',1,'owner-o',9,'pending'),
      ('cmd-foreign','idem-f','req-f','pause','mission-foreign','episode-foreign','thread-foreign',
       'org-foreign','project-foreign','actor','admin',1,'owner-f',9,'pending');`);
}

test('inspection composes scoped episode, pages, habitat, metabolism and receipts without writes', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const before = (await db.get('SELECT total_changes() AS count')).count;
    const result = await inspection.inspect(db, context({ query: { threadLimit: '2', receiptLimit: '1' } }));
    const after = (await db.get('SELECT total_changes() AS count')).count;
    assert.equal(after, before);
    assert.equal(result.readOnly, true);
    assert.equal(result.episode.rootThreadId, 'thread-root');
    assert.equal(result.threads.items.length, 2);
    assert.equal(result.threads.hasMore, true);
    assert.equal(result.threads.nextOffset, 2);
    assert.equal(result.habitat.revision.configuration.runtimeKind, 'process');
    assert.equal(result.metabolism.metrics.inputTokens.value, 15);
    assert.equal(result.metabolism.metrics.outputTokens.value, null);
    assert.equal(result.metabolism.metrics.activeTimeMs.value, null);
    assert.equal(result.metabolism.metrics.activeTimeMs.observedValue, null);
    assert.ok(result.metabolism.byCell.items.length <= 2);
    assert.equal(result.metabolism.byCell.limit, 2);
    assert.equal(result.metabolism.byCell.correlation.exact, true);
    assert.equal(result.metabolism.byCell.correlation.complete, false);
    assert.equal(result.metabolism.byCell.correlation.legacy, true);
    assert.equal(result.metabolism.byCell.legacyUncorrelated.count, 1);
    assert.ok(result.metabolism.byCell.items.every((cell) =>
      cell.episodeId === 'episode-inspection' && cell.workerId !== 'worker-foreign'
        && cell.workerId !== 'worker-other'));
    assert.equal(result.episodeRecovery.receipt.receiptId, 'recovery-inspection-latest');
    assert.equal(result.episodeRecovery.receipt.episodeId, 'episode-inspection');
    assert.equal(result.episodeRecovery.receipt.authorityTokenHash, undefined);
    assert.deepEqual(result.episodeRecovery.correlation, {
      method: 'persisted_episode_scope_key', selection: 'latest_authority_generation',
      exact: true, complete: true, legacy: false
    });
    assert.equal(result.permissionReceipts.items.length, 1);
    assert.equal(result.permissionReceipts.hasMore, true);
    assert.equal(result.permissionReceipts.correlation.exact, true);
    assert.equal(result.permissionReceipts.correlation.method, 'persisted_backend_receipt_lineage');
    assert.equal(result.permissionReceipts.correlation.appliesTo, 'items');
    assert.equal(result.permissionReceipts.correlation.complete, false);
    assert.equal(result.permissionReceipts.correlation.legacy, true);
    assert.equal(result.permissionReceipts.legacyUncorrelated.count, 1);
    assert.equal(result.permissionReceipts.legacyUncorrelated.exact, false);
    assert.match(result.permissionReceipts.items[0].callId, /^permission-local-(a|root)$/);
    assert.equal(result.permissionReceipts.items[0].requestHash, undefined);
    assert.equal(result.permissionReceipts.items[0].lineage.episodeId, 'episode-inspection');
    assert.equal(result.permissionReceipts.items[0].lineage.exact, true);
  } finally { await db.close(); }
});

test('cell aggregates preserve unknown versus zero and recovery stays episode exact', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const result = await inspection.inspect(db, context({ query: { threadLimit: '100' } }));
    const root = result.metabolism.byCell.items.find((cell) => cell.threadId === 'thread-root');
    assert.ok(root);
    assert.equal(root.workerId, 'worker-root');
    assert.equal(root.metrics.billableTokens.value, null);
    assert.equal(root.metrics.billableTokens.observedValue, 0);
    assert.equal(root.metrics.billableTokens.complete, false);
    const other = await inspection.inspect(db, context({ episodeId: 'episode-other' }));
    assert.equal(other.episodeRecovery.receipt, null);
    assert.equal(other.episodeRecovery.correlation.exact, true);
    assert.deepEqual(other.metabolism.byCell.items, []);
  } finally { await db.close(); }
});

test('inspection exposes bounded exact cell operations without sensitive payloads or writes', async () => {
  const db = await fixture();
  try {
    await seed(db);
    await seedCellOperations(db);
    const unsafe = JSON.stringify({ publicValue: 'visible', nested: {
      accessToken: 'metadata-secret', value: 7 }, password: 'hidden' });
    await db.run(`UPDATE mission_episodes SET metadata_json = ? WHERE episode_id = ?`,
      unsafe, 'episode-inspection');
    await db.run(`UPDATE cell_threads SET metadata_json = ? WHERE thread_id = ?`,
      unsafe, 'thread-root');
    const before = (await db.get('SELECT total_changes() AS count')).count;
    const result = await inspection.inspect(db, context({ query: {
      checkpointLimit: '2', controlLimit: '2'
    } }));
    assert.equal((await db.get('SELECT total_changes() AS count')).count, before);
    assert.deepEqual(result.cellCheckpoints.items.map(item => item.checkpointId), ['cp-1', 'cp-2']);
    assert.equal(result.cellCheckpoints.hasMore, true);
    assert.equal(result.cellCheckpoints.items[1].resumeState, 'resumed');
    assert.equal(result.cellCheckpoints.items[1].resumption.resumedRevision, 2);
    assert.deepEqual(result.cellCheckpoints.correlation, {
      method: 'persisted_cell_checkpoint_lineage', exact: true, complete: true,
      legacy: false, integrityVerified: false, integrity: 'not_evaluated'
    });
    assert.equal(result.operatorControls.items[0].assessment, 'pending');
    assert.equal(result.operatorControls.items[0].receipt, null);
    assert.equal(result.operatorControls.items[0].indeterminate, true);
    assert.equal(result.operatorControls.items[1].assessment, 'persisted_applied_unverified');
    assert.equal(result.operatorControls.items[1].indeterminate, true);
    assert.equal(result.operatorControls.items[1].receipt.integrity, 'unknown');
    assert.equal(result.operatorControls.correlation.complete, false);
    assert.equal(result.operatorControls.correlation.exact, true);
    assert.deepEqual(result.episode.metadata, { publicValue: 'visible', nested: { value: 7 } });
    assert.deepEqual(result.threads.items.find(item => item.threadId === 'thread-root').metadata,
      { publicValue: 'visible', nested: { value: 7 } });
    const continuation = await inspection.inspect(db, context({ query: {
      checkpointOffset: '2', controlOffset: '2'
    } }));
    assert.equal(continuation.cellCheckpoints.items[0].checkpointId, 'cp-3');
    assert.equal(continuation.operatorControls.items[0].assessment, 'reconciliation_required');
    assert.equal(continuation.operatorControls.items[0].reconciliationRequired, true);
    const full = await inspection.inspect(db, context({ query: {
      checkpointLimit: '100', controlLimit: '100'
    } }));
    assert.deepEqual(full.cellCheckpoints.items.map(item => item.checkpointId),
      ['cp-1', 'cp-2', 'cp-3']);
    assert.deepEqual(full.operatorControls.items.map(item => item.commandId),
      ['cmd-1', 'cmd-2', 'cmd-3']);
    const other = await inspection.inspect(db, context({ episodeId: 'episode-other' }));
    assert.equal(other.cellCheckpoints.items[0].checkpointId, 'cp-other');
    assert.equal(other.operatorControls.items[0].commandId, 'cmd-other');
    const serialized = JSON.stringify({ checkpoints: result.cellCheckpoints,
      controls: result.operatorControls, nextCheckpoints: continuation.cellCheckpoints,
      nextControls: continuation.operatorControls });
    for (const secret of ['request-secret', 'owner-secret', 'proof-secret',
      'authorityToken', 'context_json', 'safe']) assert.doesNotMatch(serialized, new RegExp(secret));
  } finally { await db.close(); }
});

test('inspection refuses foreign tenants, mission mismatches and unbounded pages', async () => {
  const db = await fixture();
  try {
    await seed(db);
    await assert.rejects(inspection.inspect(db, context({ scope: {
      organizationId: 'org-foreign', projectId: 'project-foreign'
    } })), error => error.code === 'MISSION_EPISODE_SCOPE_DENIED' && error.status === 403);
    await assert.rejects(inspection.inspect(db, context({ missionId: 'mission-other' })),
      error => error.code === 'MISSION_EPISODE_MISSION_MISMATCH');
    await assert.rejects(inspection.inspect(db, context({ query: { threadLimit: '101' } })),
      error => error.code === 'MISSION_INSPECTION_PAGINATION_INVALID' && error.status === 400);
    await assert.rejects(inspection.inspect(db, context({ query: { receiptOffset: '-1' } })),
      error => error.code === 'MISSION_INSPECTION_PAGINATION_INVALID');
    await assert.rejects(inspection.inspect(db, context({ query: { checkpointLimit: '101' } })),
      error => error.code === 'MISSION_INSPECTION_PAGINATION_INVALID');
    await assert.rejects(inspection.inspect(db, context({ query: { controlOffset: '-1' } })),
      error => error.code === 'MISSION_INSPECTION_PAGINATION_INVALID');
  } finally { await db.close(); }
});

test('inspection rejects a persisted lineage whose integrity hash is invalid', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const receipt = await db.get(`SELECT * FROM tool_permission_receipts
      WHERE call_id = 'permission-legacy-local'`);
    await db.run(`INSERT INTO tool_permission_receipt_lineage
      (receipt_id, mission_id, episode_id, thread_id, organization_id, project_id,
        worker_id, authorization_hash, lineage_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, receipt.receipt_id, 'mission-inspection',
    'episode-inspection', 'thread-root', SCOPE.organizationId, SCOPE.projectId,
    'worker-root', receipt.authorization_hash, '0'.repeat(64));
    await assert.rejects(inspection.inspect(db, context()),
      error => error.code === 'MISSION_INSPECTION_PERMISSION_LINEAGE_INVALID'
        && error.status === 409);
  } finally { await db.close(); }
});
