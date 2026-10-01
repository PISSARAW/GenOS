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

async function main() {
  const db = await createDb();
  try {
    await verifiesAppendAndScope(db);
    await verifiesImmutability(db);
    await verifiesValidation(db);
  } finally { await db.close(); }
  console.log('GVX ledger checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
