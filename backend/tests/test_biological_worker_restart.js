'use strict';
const fixture = require('./helpers/biologicalWorkerRestartFixture');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openDatabase } = require('./helpers/biologyDatabase');
const { completion } = require('./helpers/biologicalWorkerFixture');
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

async function rejectUnattestedResult(db, filename, contractRecord) {
  const run = await fixture.createRun(db, filename, contractRecord);
  const result = probe('execute', filename, run.id);
  assert.equal(result.result.output.sum, 5);
  const event = completion(run.id, { report: result.report, usage: { total_tokens: 0, cost_usd: 0 } });
  event.payload.evidenceVerified = true;
  event.payload.independentVerification = true;
  const saved = await execution.recordExecutionEvent(db, 'worker', event);
  assert.equal(saved.biologicalReceipt.result.completed, true);
  assert.equal(saved.biologicalReceipt.result.verified, false, 'successful computation and caller flags cannot replace a semantic attestation');
  const denied = await homeostasis.transitionMissionToComplete(db, { mission,
    context: { flags: { checked: true }, evidence: ['biological_worker_receipt'] } });
  assert.equal(denied.allowed, false, 'caller evidence labels cannot close a mission with an unattested result');
  assert.deepEqual(denied.state.executionEvidence.rejected, ['worker']);
  await assert.rejects(require('../src/services/homeostasisClosureService').assertClosure(db, mission.id),
    { code: 'HOMEOSTASIS_COMPLETION_RECEIPT_REQUIRED' });
}

async function executeAndGate(db, filename, contractRecord) {
  const run = await fixture.createRun(db, filename, contractRecord);
  const result = probe('execute', filename, run.id);
  assert.equal(result.result.output.sum, 5, 'the real bounded subset-sum executor produced the result');
  const nativeOracleRef = await fixture.observeAndVerify(db, run, result.report);
  assert.ok(nativeOracleRef?.hash, 'a real semantic attestation is required before completion');
  const raw = completion(run.id, { report: result.report, usage: { tokens: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 } });
  raw.payload.nativeOracleRef = nativeOracleRef;
  const event = telemetry.emitEvent({ ...raw, agentId: 'worker' });
  const saved = await execution.recordExecutionEvent(db, 'worker', event);
  assert.equal(saved.biologicalReceipt.result.verified, true);
  assert.equal(saved.biologicalReceipt.semanticVerification.domain, 'subset_sum');
  assert.equal(saved.biologicalReceipt.semanticVerification.costs.processes, 2);
  assert.equal(saved.biologicalReceipt.budgetAssessment.satisfied, true);
  const target = { mission, context: { flags: { checked: true } } };
  const allowed = await homeostasis.transitionMissionToComplete(db, target);
  assert.equal(allowed.allowed, true, JSON.stringify(allowed.state));
  assert.equal(allowed.receipt.executionReceipts[0].payloadHash, saved.biologicalReceipt.payloadHash);
  await require('../src/services/homeostasisClosureService').assertClosure(db, mission.id);
  return { run, target, receipt: saved.biologicalReceipt };
}

async function pendingRun(db, filename, contractRecord) {
  const run = await fixture.createRun(db, filename, contractRecord);
  const result = probe('execute', filename, run.id);
  const nativeOracleRef = await fixture.observeAndVerify(db, run, result.report);
  assert.ok(nativeOracleRef?.hash);
  const event = completion(run.id, { report: result.report, usage: { total_tokens: 0, cost_usd: 0 } });
  event.payload.nativeOracleRef = nativeOracleRef;
  await store.observe(db, { agentId: 'worker', event });
  assert.equal(await store.receipt(db, run.id), null, 'an interruption before event processing has no fabricated receipt');
  await assert.rejects(identity.setStatus(db, mission.id, 'completed'), { code: 'HOMEOSTASIS_COMPLETION_RECEIPT_REQUIRED' });
  await assert.rejects(db.run("UPDATE missions SET status = 'completed' WHERE mission_id = ?", mission.id), /receipt required/);
  return run;
}

async function afterRestart(filename, previous, run) {
  const reopened = probe('recover', filename, run.id);
  assert.equal(reopened.receipt.result.verified, true);
  assert.equal(reopened.receipt.cellId, previous.receipt.cellId);
  assert.equal(reopened.receipt.genomeHash, previous.receipt.genomeHash);
  assert.equal(reopened.receipt.runId, run.id);
  assert.notEqual(reopened.receipt.runId, previous.receipt.runId);
  assert.equal(reopened.receipt.semanticVerification.domain, 'subset_sum');
  assert.equal(reopened.receipt.semanticVerification.costs.processes, 2);
  assert.ok(reopened.receipt.semanticVerification.acceptanceHash);
  assert.equal(reopened.authority.requiredEvidence[0], 'biological_worker_receipt');
  const db = openDatabase(filename);
  try {
    const denied = await homeostasis.transitionMissionToComplete(db, { mission: { id: mission.id }, context: { missionOutcome: true } });
    assert.equal(denied.allowed, false, 'restart cannot replace the persisted checked flag by a weaker prompt fallback');
    await assert.rejects(db.run("UPDATE missions SET status = 'completed' WHERE mission_id = ?", mission.id), /receipt required/);
    const allowed = await homeostasis.transitionMissionToComplete(db, previous.target);
    assert.equal(allowed.allowed, true);
    const closed = await identity.setStatus(db, mission.id, 'completed');
    assert.equal(closed.status, 'completed');
    assert.equal(allowed.receipt.from, denied.status);
  } finally { await db.close(); }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-biology-restart-'));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'task.txt'), 'Compute subset sum with semantic evidence.');
  const filename = path.join(root, 'worker.sqlite');
  const originalPersist = telemetry.persistAsync;
  telemetry.persistAsync = () => {};
  let db = openDatabase(filename);
  try {
    const contractRecord = await fixture.setup(db);
    await rejectUnattestedResult(db, filename, contractRecord);
    const previous = await executeAndGate(db, filename, contractRecord);
    const run = await pendingRun(db, filename, contractRecord);
    await db.close(); db = null;
    await afterRestart(filename, previous, run);
  } finally {
    if (db) await db.close();
    telemetry.persistAsync = originalPersist;
    fs.rmSync(filename, { force: true });
    fs.rmSync(path.join(workspace, 'task.txt'), { force: true });
    fs.rmdirSync(workspace);
    fs.rmdirSync(root);
  }
  console.log('Real procedure execution, fresh transition binding, durable replay and closure across process restart passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
