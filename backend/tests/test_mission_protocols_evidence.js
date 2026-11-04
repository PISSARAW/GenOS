'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-evidence-ledger-test';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'mission-evidence-oracle-test';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { seed } = require('./test_bounded_worker_delegation');
const { scoped } = require('./helpers/nativeWorkerFixtures');
const { getDatabase, closeDatabase } = require('../src/db');
const bridge = require('../src/services/missionProtocols/evidence');
const Database = require('better-sqlite3');

async function qualify(db) {
  const result = await require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Compute the witnessed subset sum', workerKind: 'bounded_worker', methodContract: scoped, timeoutMs: 60000 });
  const run = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  const records = await require('../src/services/biologicalWorkerStore').observations(db, run.id);
  assert.equal(run.status, 'completed', JSON.stringify({ run, result, records }));
  const binding = await require('../src/services/missionProtocols/context').load(db, run.id);
  assert.ok(binding, 'real mission lifecycle installed a bound protocol runtime');
  assert.equal(binding.mission.synapseContext.receiver.agentId, result.childAgentId);
  const ownership = await require('../src/services/missionProtocols/continuityStore').read(binding);
  assert.equal(ownership.runId, run.id);
  const timing = new Database(path.join(binding.directory, 'allostasis.sqlite'), { readonly: true });
  try {
    const allocation = JSON.parse(timing.prepare('SELECT body FROM mission_time_runtime').get().body);
    assert.equal(allocation.finished.result.status, 'usage_recorded');
    assert.ok(allocation.finished.result.spent > 0);
    assert.equal(allocation.finished.released.held, 0);
    assert.ok(allocation.finished.released.protectedReserve > 0);
  } finally { timing.close(); }
  const row = await db.get('SELECT * FROM mission_protocol_evidence WHERE run_id=?', run.id);
  const dossier = JSON.parse(row.dossier_json);
  assert.equal(digest(dossier), row.dossier_digest);
  assert.equal(dossier.state.status, 'accepted');
  assert.equal(dossier.claim.provenance.producerId, result.childAgentId);
  const observations = await require('../src/services/biologicalWorkerStore').observations(db, run.id);
  const terminal = observations.find(item => item.event.eventType === 'AGENT_COMPLETED').event;
  const scope = terminal.payload.evidenceReport.workerArtifact.content.scopeCompletion.scopeRef;
  assert.match(scope, /fix-tests-pass/);
  assert.equal(await bridge.guardEvent(binding, terminal), terminal);
  const changed = structuredClone(terminal);
  changed.payload.evidenceReport.workerArtifact.content.result.sum++;
  await assert.rejects(bridge.guardEvent(binding, changed), /MISMATCH|CHANGED|binding/i);
  const forged = { ...terminal, payload: { ...terminal.payload, nativeOracleRef: { eventId: 'fake', hash: '0'.repeat(64) } } };
  await assert.rejects(bridge.guardEvent(binding, forged), /INVALID|MISMATCH|CHANGED/i);
  await db.run("UPDATE missions SET status='cancelled' WHERE mission_id='delegation-mission'");
  await assert.rejects(bridge.guardEvent(binding, terminal), /INACTIVE/);
  assert.equal((await db.get('SELECT dossier_digest FROM mission_protocol_evidence WHERE run_id=?', run.id)).dossier_digest, row.dossier_digest);
  console.log('Mission EVIDENCE: real native execution, portable accepted claim, durable dossier, changed result/ref/authority refusals passed.');
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mission-evidence-fix-tests-pass-'));
  const workspace = path.join(directory, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'task.txt'), 'Real bounded native task');
  process.env.GENOS_DB_PATH = path.join(directory, 'control.sqlite');
  process.env.GENOS_STUDIO_ROOT = path.join(directory, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(directory, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = directory;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try { await seed(db, workspace); await qualify(db); }
  finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await closeDatabase();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
