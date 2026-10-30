'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { openDatabase } = require('./helpers/biologyDatabase');
const { workerSchema, addWorker, completion } = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const homeostasis = require('../src/services/homeostasisService');
const identity = require('../src/services/missionIdentityService');
const store = require('../src/services/biologicalWorkerStore');
const telemetry = require('../src/services/telemetryObserver');

const mission = { id: 'worker-mission', completionContract: { requiredEvidence: ['biological_worker_receipt'],
  invariants: [{ id: 'checked', verifier: { type: 'context.flag', flag: 'checked' } }] } };

function probe(mode, filename, runId) {
  const child = spawnSync(process.execPath, [path.join(__dirname, 'helpers/biologicalWorkerProbe.cjs'), mode, filename, runId],
    { encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

async function executeWithoutOracle(db, filename, contractRecord) {
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord, budget: { tokens: 0, deterministic: true } });
  const result = probe('execute', filename, run.id);
  assert.equal(result.result.output.sum, 5, 'the real bounded subset-sum executor produced the result');
  const raw = completion(run.id, { report: result.report, usage: { tokens: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 } });
  const event = telemetry.emitEvent({ ...raw, agentId: 'worker' });
  const saved = await execution.recordExecutionEvent(db, 'worker', event);
  assert.equal(saved.biologicalReceipt.budgetAssessment.satisfied, true);
  const target = { mission, context: { flags: { checked: true } } };
  const allowed = await homeostasis.transitionMissionToComplete(db, target);
  assert.equal(saved.biologicalReceipt.result.completed, true);
  assert.equal(saved.biologicalReceipt.result.verified, false, 'runProcedure has no accepted semantic attestation');
  assert.equal(saved.biologicalReceipt.semanticVerification, undefined);
  assert.equal(allowed.allowed, false, 'a real calculation and a checked flag do not replace semantic verification');
  await assert.rejects(require('../src/services/homeostasisClosureService').assertClosure(db, mission.id),
    { code: 'HOMEOSTASIS_COMPLETION_RECEIPT_REQUIRED' });
  return { run, target, receipt: saved.biologicalReceipt };
}

async function pendingRun(db, filename, contractRecord) {
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord, budget: { tokens: 0, deterministic: true } });
  const result = probe('execute', filename, run.id);
  const event = completion(run.id, { report: result.report, usage: { total_tokens: 0, cost_usd: 0 } });
  await store.observe(db, { agentId: 'worker', event });
  assert.equal(await store.receipt(db, run.id), null, 'an interruption before event processing has no fabricated receipt');
  await assert.rejects(identity.setStatus(db, mission.id, 'completed'), { code: 'HOMEOSTASIS_COMPLETION_RECEIPT_REQUIRED' });
  await assert.rejects(db.run("UPDATE missions SET status = 'completed' WHERE mission_id = ?", mission.id), /receipt required/);
  return run;
}

async function afterRestart(filename, previous, run) {
  const reopened = probe('recover', filename, run.id);
  assert.equal(reopened.receipt.result.completed, true);
  assert.equal(reopened.receipt.result.verified, false, 'recovery preserves the absence of a semantic proof');
  assert.equal(reopened.receipt.semanticVerification, undefined);
  assert.equal(reopened.receipt.cellId, previous.receipt.cellId);
  assert.equal(reopened.receipt.genomeHash, previous.receipt.genomeHash);
  assert.equal(reopened.authority.requiredEvidence[0], 'biological_worker_receipt');
  const db = openDatabase(filename);
  try {
    const denied = await homeostasis.transitionMissionToComplete(db, { mission: { id: mission.id }, context: { missionOutcome: true } });
    assert.equal(denied.allowed, false, 'restart cannot replace the persisted checked flag by a weaker prompt fallback');
    await assert.rejects(db.run("UPDATE missions SET status = 'completed' WHERE mission_id = ?", mission.id), /receipt required/);
    const checked = await homeostasis.transitionMissionToComplete(db, previous.target);
    assert.equal(checked.allowed, false, 'even the persisted checked flag cannot qualify an unverified receipt');
    await assert.rejects(identity.setStatus(db, mission.id, 'completed'),
      { code: 'HOMEOSTASIS_COMPLETION_RECEIPT_REQUIRED' });
    assert.equal((await identity.get(db, mission.id)).status, 'active');
  } finally { await db.close(); }
}

async function main() {
  const filename = path.join(os.tmpdir(), `genos-biology-restart-${randomUUID()}.sqlite`);
  const originalPersist = telemetry.persistAsync;
  telemetry.persistAsync = () => {};
  let db = openDatabase(filename);
  try {
    await workerSchema(db);
    const contractRecord = await addWorker(db);
    const previous = await executeWithoutOracle(db, filename, contractRecord);
    const run = await pendingRun(db, filename, contractRecord);
    await db.close(); db = null;
    await afterRestart(filename, previous, run);
  } finally {
    if (db) await db.close();
    telemetry.persistAsync = originalPersist;
    fs.rmSync(filename, { force: true });
  }
  console.log('Real procedure execution and unverified receipt remain non-promotable across process restart: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
