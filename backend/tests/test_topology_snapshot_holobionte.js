'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const adapter = require('../src/services/topologySnapshots/holobionte');
const snapshotService = require('../src/services/topologySnapshotService');
const store = require('../src/services/holobionte/holobiontStore');
const { seal } = require('../src/services/topologySnapshotContract');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const { migrateHolobiontLedger } = require('../src/db/migrations/migrateHolobiontLedger');
const { migrateHolobiontMemory } = require('../src/db/migrations/migrateHolobiontMemory');

snapshotService.registerAdapter('holobionte', adapter);

async function fixture(variant = 'organelle') {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);`);
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  await migrateHolobiontLedger(db);
  await migrateHolobiontMemory(db);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?)', 'workspace-1', 'org-1', 'project-1');
  await db.run('INSERT INTO agents VALUES (?, ?)', 'host-1', 'workspace-1');
  const session = await store.createSession(db, { holobiontId: 'session-1', hostId: 'host-1',
    workspaceId: 'workspace-1', projectId: 'project-1', scope: 'WORKSPACE' });
  const receipt = { receiptId: 'selection-1', variantId: variant };
  const revision = await store.appendEvent(db, { holobiontId: session.holobiontId,
    expectedRevision: session.revision, eventType: 'VARIANT_SELECTED',
    payload: { variantId: variant, selectionReceipt: receipt, policy: { placement: {} } } });
  await store.updateLifecycleStatus(db, { holobiontId: session.holobiontId,
    expectedRevision: revision, status: 'QUIESCENT', eventType: 'QUIESCENT' });
  const context = { db, topologyId: 'holobionte', variantId: variant,
    sessionId: session.holobiontId, agentId: 'host-1', workspaceId: 'workspace-1',
    workerKind: 'bounded_worker',
    scope: { clause: 'w.organization_id = ? AND w.project_id = ?', params: ['org-1', 'project-1'] } };
  return { db, context };
}

test('Holobionte captures and preflights all twelve persisted variants', async () => {
  for (const variant of Object.keys(adapter.VARIANT_FIELDS)) {
    const { db, context } = await fixture(variant);
    try {
      const manifest = await snapshotService.capture(context);
      assert.equal(manifest.boundary.status, 'QUIESCENT');
      assert.equal(manifest.components.find((item) => item.id === 'variant-policy').reference.variant, variant);
      assert.equal((await snapshotService.preflightRestore({ ...context, manifest })).allowed, true);
      const external = manifest.components.find((item) => item.id === 'external-effects');
      assert.equal(Boolean(external), variant === 'tool' || variant.includes('cloud') || variant.includes('edge'));
      if (external) assert.equal(external.status, 'reference-only');
    } finally { await db.close(); }
  }
});

test('Holobionte refuses foreign workspace, host, and variant bindings', async () => {
  const { db, context } = await fixture();
  try {
    await assert.rejects(adapter.capture({ ...context, agentId: 'other-host' }),
      { code: 'HOLOBIONTE_SNAPSHOT_OWNER_MISMATCH' });
    await assert.rejects(adapter.capture({ ...context, variantId: 'tool' }),
      { code: 'HOLOBIONTE_SNAPSHOT_VARIANT_MISMATCH' });
    await assert.rejects(adapter.capture({ ...context, scope: {
      clause: context.scope.clause, params: ['org-2', 'project-1']
    } }), { code: 'HOLOBIONTE_SNAPSHOT_OWNER_MISMATCH' });
  } finally { await db.close(); }
});

test('Holobionte rejects an incomplete immutable journal and active host', async () => {
  const { db, context } = await fixture();
  try {
    const manifest = seal(context, await adapter.capture(context));
    await db.exec('DROP TRIGGER holobiont_events_no_delete');
    await db.run('DELETE FROM holobiont_events WHERE holobiont_id = ? AND revision = 2', context.sessionId);
    await assert.rejects(adapter.capture(context), { code: 'HOLOBIONTE_SNAPSHOT_JOURNAL_GAP' });
    assert.equal((await adapter.preflightRestore(context, manifest)).ok, true);
    assert.equal((await adapter.preflightRestore(context, { boundary: { status: 'ACTIVE' } })).ok, false);
  } finally { await db.close(); }
});

test('Holobionte rejects a contribution receipt without a bound contract', async () => {
  const { db, context } = await fixture();
  try {
    await db.exec('PRAGMA foreign_keys = OFF');
    await db.run(`INSERT INTO holobiont_symbiosis_ledger
      (ledger_id, receipt_id, holobiont_id, contract_id, contract_revision, symbiont_id,
       capability, benefit_score, contribution_score, cost_score, risk_score,
       resources_used_json, evidence_refs_json, verifier_id, result_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'ledger-1', 'receipt-1', context.sessionId, 'missing', 1, 'symbiont-1',
    'review', 0.8, 0.8, 0.1, 0.1, '{}', '[]', 'verifier-1', 'sha256:test');
    await assert.rejects(adapter.capture(context), { code: 'HOLOBIONTE_SNAPSHOT_RECEIPT_CONFLICT' });
  } finally { await db.close(); }
});

test('Holobionte shared preflight refuses collective state drift', async () => {
  const { db, context } = await fixture();
  try {
    const manifest = await snapshotService.capture(context);
    await store.appendEvent(db, { holobiontId: context.sessionId,
      expectedRevision: manifest.boundary.revision, eventType: 'IMMUNE_REJECTION',
      payload: { reason: 'later-review' } });
    await assert.rejects(snapshotService.preflightRestore({ ...context, manifest }),
      { code: 'TOPOLOGY_SNAPSHOT_DRIFT' });
  } finally { await db.close(); }
});
