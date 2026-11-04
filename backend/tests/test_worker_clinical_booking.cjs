'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-clinical-booking-'));
Object.assign(process.env, { GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1',
  GENOS_DB_PATH: path.join(root, 'control.sqlite'), GENOS_STUDIO_ROOT: path.join(root, 'studio'),
  GENOS_AGENT_DNA: '0', NODE_ENV: 'test', GENOS_GVX_LEDGER_HMAC_SECRET: 'clinical-booking-test-only' });
const database = require('../src/db');
const clinical = require('../src/services/workerClinicalAdmission');
const fixtures = require('./test_bounded_worker_delegation');

async function inputFor(db, id) {
  await fixtures.addChild(db, { id, native: true });
  await require('../src/services/missionIdentityService').attachAgent(db,
    { missionId: 'delegation-mission', agentId: id, role: 'bounded_worker' });
  return { agent: await db.get('SELECT * FROM agents WHERE id=?', id),
    mission: { agentId: id, missionId: 'delegation-mission', timeoutMs: 300000 } };
}

async function liveWorker(db, contract) {
  const input = await inputFor(db, 'clinical-booked');
  await db.run("UPDATE agents SET status='running' WHERE id=?", input.agent.id);
  const admitted = await clinical.admit(db, input);
  assert.equal(admitted.checked, true, 'A garage booking without an execution run must remain admissible');
  clinical.verify(admitted, { agentId: input.agent.id, missionId: 'delegation-mission', scope: admitted.scope });
  const run = await require('../src/services/strategyExecutionService').createExecutionRun(db, {
    agentId: input.agent.id, missionId: 'delegation-mission', contractRecord: contract,
    budget: { tokens: 1000, costUsd: 1, latencyMs: 300000 } });
  const saved = (await db.get('SELECT metadata_json FROM agents WHERE id=?', input.agent.id)).metadata_json;
  for (const status of ['planned', 'running']) {
    await db.run('UPDATE strategy_execution_runs SET status=? WHERE id=?', status, run.id);
    await assert.rejects(clinical.admit(db, input), { code: 'WORKER_CLINICAL_ADMISSION_CONFLICT' });
    assert.equal((await db.get('SELECT metadata_json FROM agents WHERE id=?', input.agent.id)).metadata_json, saved);
  }
  await db.run("UPDATE strategy_execution_runs SET status='cancelled' WHERE id=?", run.id);
  assert.equal((await clinical.admit(db, input)).checked, true, 'A historical run does not claim an active execution');
}

async function parentControl(db) {
  const parent = await db.get("SELECT * FROM agents WHERE id='delegation-root'");
  const active = await db.get("SELECT id FROM strategy_execution_runs WHERE agent_id=? AND status='planned'", parent.id);
  assert.ok(active, 'Use a genuine existing parent control run');
  const input = { agent: parent, mission: { agentId: parent.id, missionId: 'delegation-mission', timeoutMs: 300000 } };
  const record = await clinical.admit(db, input);
  assert.equal(record.checked, true);
  await clinical.bindRun(db, { runId: active.id, agentId: parent.id, mission: input.mission });
  const expected = { runId: active.id, agentId: parent.id, missionId: 'delegation-mission', scope: record.scope };
  assert.equal((await clinical.verifyRun(db, expected)).record.signature, record.signature);
  await clinical.admit(db, input);
  await assert.rejects(clinical.bindRun(db, { runId: active.id, agentId: parent.id, mission: input.mission }),
    { code: 'WORKER_CLINICAL_ADMISSION_CONFLICT' });
  assert.equal((await clinical.verifyRun(db, expected)).record.signature, record.signature,
    'A new medical scan must not replace the immutable admission already bound to a run');
  await require('../src/services/medical/immuneSurveillanceService').quarantine(db, parent.id,
    { reason: 'Clinical quarantine must still refuse a parent control actor' });
  await assert.rejects(clinical.verifyRun(db, expected), { code: 'WORKER_CLINICAL_ADMISSION_REVOKED' });
}

async function concurrentMetadata(db) {
  const input = await inputFor(db, 'clinical-concurrent');
  const gate = require('../src/services/medical/missionQuarantineGate');
  const inspect = gate.inspectMissionDispatchAllowed;
  gate.inspectMissionDispatchAllowed = async (...args) => {
    const result = await inspect(...args);
    const row = await db.get('SELECT metadata_json FROM agents WHERE id=?', input.agent.id);
    await db.run('UPDATE agents SET metadata_json=? WHERE id=?',
      JSON.stringify({ ...JSON.parse(row.metadata_json), concurrentMarker: true }), input.agent.id);
    return result;
  };
  try { await assert.rejects(clinical.admit(db, input), { code: 'WORKER_CLINICAL_ADMISSION_CONFLICT' }); }
  finally { gate.inspectMissionDispatchAllowed = inspect; }
  const saved = JSON.parse((await db.get('SELECT metadata_json FROM agents WHERE id=?', input.agent.id)).metadata_json);
  assert.equal(saved.concurrentMarker, true);
  assert.equal(saved.clinicalAdmission, undefined, 'Admission must not overwrite a concurrent metadata change');
}

async function main() {
  const db = await database.getDatabase();
  try {
    const contract = await fixtures.seed(db, root);
    await require('../src/services/garageRuntimeService').stop(db);
    await liveWorker(db, contract);
    await concurrentMetadata(db);
    await parentControl(db);
    console.log('Clinical admission: garage booking, active worker refusal, historical run, parent control, quarantine and concurrent metadata PASS');
  } finally {
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await database.closeDatabase();
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(root), /^genos-clinical-booking-/);
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
