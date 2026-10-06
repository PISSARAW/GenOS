'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const receipts = require('../src/services/orchestrationActionReceiptService');
const { migrateOrchestrationReceipts } = require('../src/db/migrations/migrateOrchestrationReceipts');

function context(db, eventId) {
  return { db, orchestratorId: 'orch', sourceAgentId: 'worker', sourceEventId: eventId,
    decision: { tool: 'genos_replay', action: 'replay_before_promotion' },
    event: { id: eventId, eventType: 'AGENT_COMPLETED', payload: { snapshot: 'snapshot.json' } },
    workspaceRoot: process.cwd() };
}

async function concurrentClaims(databases) {
  const claimants = Array.from({ length: 20 }, (_, index) => context(databases[index % 2], 'concurrent'));
  const duplicates = await Promise.all(claimants.map((claimant) => receipts.claim(claimant)));
  assert.equal(duplicates.filter((duplicate) => !duplicate).length, 1);
  const owner = claimants.find((claimant) => claimant.claimToken);
  assert.equal(await receipts.finish(owner, { status: 'completed', result: { success: true } }), true);
  assert.equal(await receipts.claim(context(databases[1], 'concurrent')), true);
}

async function interruptedClaim(databases) {
  const former = context(databases[0], 'interrupted');
  await receipts.claim(former);
  await former.db.run("UPDATE orchestration_action_receipts SET created_at = datetime('now', '-10 minutes') WHERE source_event_id = 'interrupted'");
  const resumed = context(databases[1], 'interrupted');
  const competitor = context(databases[0], 'interrupted');
  const results = await Promise.all([receipts.claim(resumed), receipts.claim(competitor)]);
  assert.equal(results.filter((duplicate) => !duplicate).length, 1);
  assert.equal(await receipts.finish(former, { status: 'completed' }), false, 'an expired executor cannot overwrite a new owner');
  assert.equal(await receipts.renew(former), false);
  const current = [resumed, competitor].find((claimant) => claimant.claimToken);
  assert.equal(await receipts.renew(current), true);
  const row = await current.db.get("SELECT * FROM orchestration_action_receipts WHERE source_event_id = 'interrupted'");
  assert.equal(row.attempts, 2);
  assert.equal(JSON.parse(row.context_json).event.id, 'interrupted');
  assert.equal(await receipts.finish(current, { status: 'completed' }), true);
}

async function deferredAndFailedClaims(databases) {
  const deferred = context(databases[0], 'deferred');
  await receipts.claim(deferred);
  await receipts.finish(deferred, { status: 'failed', deferred: true, result: { reason: 'missing_required_evidence' } });
  const ready = context(databases[1], 'deferred');
  assert.equal(await receipts.claim(ready), false);
  await receipts.finish(ready, { status: 'failed', result: { error: 'verification failed' } });
  assert.equal(await receipts.claim(context(databases[0], 'deferred')), true, 'a terminal failure must not be retried implicitly');
}

async function legacyMigration(db) {
  await db.run("INSERT INTO orchestration_action_receipts (receipt_key, orchestrator_id, source_event_id, tool, status) VALUES ('orch:legacy:genos_replay', 'orch', 'legacy', 'genos_replay', 'completed')");
  await migrateOrchestrationReceipts(db);
  await migrateOrchestrationReceipts(db);
  const row = await db.get("SELECT * FROM orchestration_action_receipts WHERE source_event_id = 'legacy'");
  assert.equal(row.status, 'completed');
  assert.equal(await receipts.claim(context(db, 'legacy')), true);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-orchestrator-receipts-'));
  const filename = path.join(directory, 'receipts.db');
  const databases = [];
  try {
    for (let index = 0; index < 2; index += 1) {
      const db = await open({ filename, driver: sqlite3.Database });
      databases.push(db);
      await db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
    }
    await databases[0].exec(`CREATE TABLE orchestration_action_receipts (
      receipt_key TEXT PRIMARY KEY, orchestrator_id TEXT NOT NULL, source_event_id TEXT NOT NULL,
      tool TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT)`);
    await legacyMigration(databases[0]);
    await concurrentClaims(databases);
    await interruptedClaim(databases);
    await deferredAndFailedClaims(databases);
    console.log('Orchestrator receipts: concurrent connections, fenced stale owners, renewal, migration and deferred retries passed.');
  } finally {
    await Promise.all(databases.map((db) => db.close()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
