'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const ledger = require('../src/services/gvxDevelopmentLedger');

async function createDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateGvxLedger(db);
  return db;
}

async function verifiesAppendAndScope(db) {
  const event = await ledger.appendEvent(db, {
    organizationId: 'org-a', projectId: 'project-a', entityId: 'organism-a',
    type: 'transformation_proposed', parentHash: 'a'.repeat(64),
    candidateHash: 'b'.repeat(64), payload: { hypothesis: 'measured change' }
  });
  assert.strictEqual(event.payload.hypothesis, 'measured change');
  assert.strictEqual((await ledger.listEvents(db, {
    organizationId: 'org-a', projectId: 'project-a', entityId: 'organism-a'
  })).length, 1);
  assert.deepStrictEqual(await ledger.listEvents(db, {
    organizationId: 'org-b', projectId: 'project-a', entityId: 'organism-a'
  }), []);
  assert.deepStrictEqual(await ledger.getEvent(db, event.id, {
    organizationId: 'org-b', projectId: 'project-a'
  }), undefined);
}

async function verifiesImmutability(db) {
  const event = await ledger.appendEvent(db, {
    organizationId: 'org-a', projectId: 'project-a', entityId: 'organism-a',
    type: 'decision_recorded', payload: { decision: 'inconclusive' }
  });
  await assert.rejects(db.run('UPDATE gvx_development_events SET payload_json = ? WHERE id = ?', '{}', event.id), /gvx_event_is_immutable/);
  await assert.rejects(db.run('DELETE FROM gvx_development_events WHERE id = ?', event.id), /gvx_event_is_immutable/);
}

async function verifiesValidation(db) {
  await assert.rejects(ledger.appendEvent(db, { organizationId: 'org-a' }), { code: 'GVX_EVENT_INVALID' });
  assert.ok(ledger.validateEvent({
    organizationId: 'org-a', projectId: 'project-a', entityId: 'organism-a',
    type: 'decision_recorded', parentHash: 'bad', payload: {}
  }).includes('parentHash-invalid'));
}

async function verifiesHashChain(db) {
  const scope = { organizationId: 'org-a', projectId: 'project-a', entityId: 'organism-a' };
  const valid = await ledger.verifyLedgerChain(db, scope);
  assert.strictEqual(valid.valid, true);
  assert.ok(valid.headHash.match(/^[a-f0-9]{64}$/));
  await db.exec('DROP TRIGGER gvx_events_no_update');
  await db.run('UPDATE gvx_development_events SET payload_json = ? WHERE id = (SELECT id FROM gvx_development_events LIMIT 1)', '{}');
  const tampered = await ledger.verifyLedgerChain(db, scope);
  assert.strictEqual(tampered.valid, false);
  assert.strictEqual(tampered.reason, 'event-hash-mismatch');
  await assert.rejects(ledger.listEvents(db, scope), { code: 'GVX_LEDGER_CHAIN_INVALID' });
}

async function verifiesLegacyMigration() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE gvx_development_events (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL, entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL, parent_hash TEXT, candidate_hash TEXT, payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    await db.run(`INSERT INTO gvx_development_events
      (id, organization_id, project_id, entity_id, event_type, payload_json)
      VALUES ('legacy-event', 'org-a', 'project-a', 'organism-a', 'snapshot_created', '{}')`);
    await migrateGvxLedger(db);
    const result = await ledger.verifyLedgerChain(db, {
      organizationId: 'org-a', projectId: 'project-a', entityId: 'organism-a'
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.eventCount, 1);
  } finally { await db.close(); }
}

async function main() {
  const db = await createDb();
  try {
    await verifiesAppendAndScope(db);
    await verifiesImmutability(db);
    await verifiesValidation(db);
    await verifiesHashChain(db);
  } finally { await db.close(); }
  await verifiesLegacyMigration();
  console.log('GVX ledger checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
