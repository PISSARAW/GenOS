'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateMetabolicLedger } = require('../src/db/migrations/migrateMetabolicLedger');
const { migrateMetabolicLedgerCellLineage } = require('../src/db/migrations/migrateMetabolicLedgerCellLineage');
const ledger = require('../src/services/metabolicLedgerService');
const bridge = require('../src/services/metabolicLedgerRuntimeBridge');

async function database() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateMetabolicLedger(db);
  await db.exec(`CREATE TABLE cell_threads (
    thread_id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, mission_id TEXT NOT NULL,
    organization_id TEXT NOT NULL, project_id TEXT NOT NULL, worker_id TEXT NOT NULL,
    status TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  return db;
}

async function seedCell(db, input) {
  await db.run(`INSERT INTO cell_threads
    (thread_id, episode_id, mission_id, organization_id, project_id, worker_id, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', '2026-10-15T10:00:00.000Z')`,
  input.threadId, input.episodeId, input.missionId, input.organizationId,
  input.projectId, input.workerId);
}

function runtimeContext(db) {
  return { db, mission: { missionId: 'mission-real', agentId: 'worker-1',
    runtimeStartedAt: Date.parse('2026-10-15T10:00:00.000Z') },
  exactTokens: 0, estimatedTokens: 0, observedCostUsd: 0,
  tokenUsageObserved: true, tokenUsageUnknown: false,
  costUsageObserved: false, costUsageUnknown: false, code: 0 };
}

function modelResult(routeAttemptId) {
  return { routeAttemptId, model: 'openai://test', inputTokens: 1, outputTokens: 1,
    tokenUsageMeasured: true, providerCalled: true, catalogPricingKnown: false,
    attemptStatus: 'completed', usageReceipt: { responseId: routeAttemptId } };
}

async function verifyBackendLineageAndIdempotence() {
  const db = await database();
  await seedCell(db, { missionId: 'mission-real', episodeId: 'episode-1',
    threadId: 'thread-1', workerId: 'worker-1', organizationId: 'org-a',
    projectId: 'project-a' });
  const ctx = runtimeContext(db);
  await bridge.recordRuntimeUsage(db, ctx);
  await bridge.recordRuntimeUsage(db, ctx);
  const scope = { executionRunId: 'run-1', agentId: 'worker-1',
    organizationId: 'org-a', projectId: 'project-a' };
  await bridge.recordModelUsage(db, scope, { routeAttemptId: 'provider-attempt',
    model: 'openai://test', inputTokens: 2, outputTokens: 1,
    tokenUsageMeasured: true, providerCalled: true, catalogPricingKnown: false,
    attemptStatus: 'completed', usageReceipt: { responseId: 'provider-response' } });
  await bridge.recordModelUsage(db, scope, { routeAttemptId: 'estimated-attempt',
    model: 'openai://test', inputTokens: 3, outputTokens: 1,
    tokenUsageMeasured: false, providerCalled: true, catalogPricingKnown: false,
    attemptStatus: 'completed' });
  await bridge.recordModelUsage(db, scope, { routeAttemptId: 'unknown-attempt',
    model: 'openai://test', inputTokens: null, outputTokens: null,
    tokenUsageSource: 'unknown', providerCalled: true, catalogPricingKnown: false,
    attemptStatus: 'failed' });
  const rows = await db.all('SELECT * FROM metabolic_ledger_observations');
  assert.equal(rows.length, 4, 'replayed runtime persistence must not double count');
  assert.equal(rows.every((row) => row.mission_id === 'mission-real'
    && row.episode_id === 'episode-1' && row.thread_id === 'thread-1'
    && row.worker_id === 'worker-1'), true, 'every provenance class keeps backend lineage');
  assert.deepEqual({ missionId: rows[0].mission_id, episodeId: rows[0].episode_id,
    threadId: rows[0].thread_id, workerId: rows[0].worker_id,
    organizationId: rows[0].organization_id, projectId: rows[0].project_id }, {
    missionId: 'mission-real', episodeId: 'episode-1', threadId: 'thread-1',
    workerId: 'worker-1', organizationId: 'org-a', projectId: 'project-a'
  });
  assert.equal(JSON.parse(rows[0].metadata_json).lineageSource, 'backend_cell_thread');
  const sources = new Set((await db.all('SELECT source FROM metabolic_ledger_measurements'))
    .map((row) => row.source));
  assert.deepEqual([...sources].sort(), ['estimated', 'exact', 'provider_receipt', 'unavailable']);
  await db.close();
}

async function verifyFalseThreadFailsClosed() {
  const db = await database();
  await seedCell(db, { missionId: 'mission-real', episodeId: 'episode-1',
    threadId: 'thread-real', workerId: 'worker-1', organizationId: 'org-a',
    projectId: 'project-a' });
  const ctx = runtimeContext(db);
  ctx.mission.episodeId = 'episode-1';
  ctx.mission.threadId = 'thread-invented';
  await assert.rejects(bridge.recordRuntimeUsage(db, ctx),
    { code: 'METABOLIC_CELL_SCOPE_COLLISION' });
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM metabolic_ledger_observations')).count, 0);
  await db.close();
}

async function verifyWrongTenantFailsClosed() {
  const db = await database();
  await seedCell(db, { missionId: 'mission-real', episodeId: 'episode-1',
    threadId: 'thread-1', workerId: 'worker-1', organizationId: 'org-a',
    projectId: 'project-a' });
  await assert.rejects(bridge.recordModelUsage(db, {
    executionRunId: 'run-wrong-tenant', agentId: 'worker-1',
    organizationId: 'org-b', projectId: 'project-b'
  }, modelResult('wrong-tenant')), { code: 'METABOLIC_CELL_SCOPE_COLLISION' });
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM metabolic_ledger_observations')).count, 0);
  await db.close();
}

async function verifyAmbiguityDropsCellIdentity() {
  const db = await database();
  const common = { missionId: 'mission-real', workerId: 'worker-1',
    organizationId: 'org-a', projectId: 'project-a' };
  await seedCell(db, { ...common, episodeId: 'episode-1', threadId: 'thread-1' });
  await seedCell(db, { ...common, episodeId: 'episode-2', threadId: 'thread-2' });
  await bridge.recordModelUsage(db, { executionRunId: 'run-ambiguous',
    agentId: 'worker-1', organizationId: 'org-a', projectId: 'project-a'
  }, modelResult('ambiguous'));
  const row = await db.get('SELECT * FROM metabolic_ledger_observations');
  assert.deepEqual({ missionId: row.mission_id, episodeId: row.episode_id,
    threadId: row.thread_id, workerId: row.worker_id }, {
    missionId: 'run-ambiguous', episodeId: null, threadId: null, workerId: null
  });
  assert.equal(JSON.parse(row.metadata_json).lineageSource, 'backend_lineage_ambiguous');
  await db.close();
}

function observation(id, lineage, measurement) {
  return { id, missionId: 'mission-shared', ...lineage,
    observedAt: '2026-10-15T10:00:00.000Z', measurements: {
      billableTokens: measurement
    } };
}

async function verifyTenantCellAggregates() {
  const db = await database();
  const cellA = { organizationId: 'org-a', projectId: 'project-a',
    episodeId: 'episode-a', threadId: 'thread-a', workerId: 'worker-a' };
  const cellB = { organizationId: 'org-b', projectId: 'project-b',
    episodeId: 'episode-b', threadId: 'thread-b', workerId: 'worker-b' };
  const zero = observation('obs-zero', cellA, { value: 0, source: 'exact' });
  await ledger.recordMetabolicObservation(db, zero);
  await ledger.recordMetabolicObservation(db, zero);
  await ledger.recordMetabolicObservation(db, observation('obs-unknown', cellA,
    { source: 'unavailable', unavailableReason: 'provider omitted usage' }));
  await ledger.recordMetabolicObservation(db, observation('obs-foreign', cellB,
    { value: 900, source: 'provider_receipt', evidenceRef: 'receipt:foreign' }));
  const result = await ledger.aggregateMetabolicUsageByCell(db, {
    missionId: 'mission-shared', organizationId: 'org-a', projectId: 'project-a'
  });
  assert.equal(result.cells.length, 1, 'foreign tenant cell must remain invisible');
  assert.deepEqual({ episodeId: result.cells[0].episodeId,
    threadId: result.cells[0].threadId, workerId: result.cells[0].workerId }, {
    episodeId: 'episode-a', threadId: 'thread-a', workerId: 'worker-a'
  });
  const tokens = result.cells[0].metrics.billableTokens;
  assert.equal(tokens.value, null, 'unknown must not become a numeric zero');
  assert.equal(tokens.observedValue, 0, 'an observed exact zero remains observable');
  assert.deepEqual(tokens.sources, { exact: 1, unavailable: 1 });
  assert.equal((await db.get(`SELECT COUNT(*) AS count FROM metabolic_ledger_observations
    WHERE observation_id = 'obs-zero'`)).count, 1);
  await assert.rejects(ledger.recordMetabolicObservation(db,
    { ...zero, measurements: { billableTokens: { value: 1, source: 'exact' } } }),
  { code: 'METABOLIC_OBSERVATION_ID_COLLISION' });
  await assert.rejects(ledger.aggregateMetabolicUsageByCell(db, {
    missionId: 'mission-shared', organizationId: 'org-a'
  }), /projectId is required/);
  await db.close();
}

async function verifyLegacyRowsRemainReadable() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE metabolic_ledger_observations (
    observation_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, thread_id TEXT,
    organization_id TEXT, project_id TEXT, provider TEXT, model TEXT,
    operation_id TEXT, started_at TEXT, finished_at TEXT, observed_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL
  );
  CREATE TABLE metabolic_ledger_measurements (
    observation_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL,
    source TEXT NOT NULL, PRIMARY KEY (observation_id, metric)
  );
  INSERT INTO metabolic_ledger_observations VALUES
    ('legacy', 'mission-legacy', NULL, 'org-a', 'project-a', NULL, NULL,
     NULL, NULL, NULL, '2026-10-15T09:00:00.000Z', '{}');
  INSERT INTO metabolic_ledger_measurements VALUES
    ('legacy', 'billable_tokens', 4, 'exact');`);
  await migrateMetabolicLedgerCellLineage(db);
  await migrateMetabolicLedgerCellLineage(db);
  const result = await ledger.aggregateMetabolicUsageByCell(db, {
    missionId: 'mission-legacy', organizationId: 'org-a', projectId: 'project-a'
  });
  assert.equal(result.cells[0].workerId, null);
  assert.equal(result.cells[0].metrics.billableTokens.value, 4);
  await db.close();
}

async function main() {
  await verifyBackendLineageAndIdempotence();
  await verifyFalseThreadFailsClosed();
  await verifyWrongTenantFailsClosed();
  await verifyAmbiguityDropsCellIdentity();
  await verifyTenantCellAggregates();
  await verifyLegacyRowsRemainReadable();
  console.log('Metabolic cell lineage, tenant aggregation and idempotence: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
