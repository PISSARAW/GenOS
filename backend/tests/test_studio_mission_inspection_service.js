'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
process.env.GENOS_TOOL_MEMBRANE_HMAC_SECRET ||= 'studio-inspection-service-secret-32-bytes';
const { migrateMissionEpisodes } = require('../src/db/migrations/migrateMissionEpisodes');
const { migrateHabitatRevisions } = require('../src/db/migrations/migrateHabitatRevisions');
const { migrateMetabolicLedger } = require('../src/db/migrations/migrateMetabolicLedger');
const { migrateToolPermissionMembrane } = require('../src/db/migrations/migrateToolPermissionMembrane');
const episodes = require('../src/services/missionEpisodeService');
const threads = require('../src/services/cellThreadService');
const habitats = require('../src/services/habitatRevisionService');
const ledger = require('../src/services/metabolicLedgerService');
const membrane = require('../src/services/toolPermissionMembraneService');
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
  await migrateToolPermissionMembrane(db);
  return db;
}

async function seed(db) {
  await episodes.create(db, { ...SCOPE, missionId: 'mission-inspection',
    episodeId: 'episode-inspection', organismRevision: 'organism-r1' });
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
    missionId: 'mission-inspection', threadId: 'thread-root',
    measurements: { inputTokens: { value: 12, source: 'exact' },
      outputTokens: { source: 'unavailable', unavailableReason: 'provider omitted usage' } } });
  await ledger.recordMetabolicObservation(db, { organizationId: 'org-foreign',
    projectId: 'project-foreign', id: 'observation-foreign', missionId: 'mission-inspection',
    measurements: { inputTokens: { value: 999, source: 'exact' } } });
  await membrane.authorizeToolCall(db, permission('permission-local', SCOPE));
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
    assert.equal(result.metabolism.metrics.inputTokens.value, 12);
    assert.equal(result.metabolism.metrics.outputTokens.value, null);
    assert.equal(result.permissionReceipts.items.length, 1);
    assert.equal(result.permissionReceipts.correlation.exact, false);
    assert.equal(result.permissionReceipts.items[0].callId, 'permission-local');
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
  } finally { await db.close(); }
});
