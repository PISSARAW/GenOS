'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { digest } = require('../src/services/biologicalIntegrity');
const store = require('../src/services/biologicalWorkerStore');
const reader = require('../src/services/topology/workerResultReader.cjs');
const { buildBiologicalOutput } = require('../src/services/topology/biologicalOutputBuilder.cjs');
const { handleBiologicalCondition } = require('../src/services/topology/biologicalConditions.cjs');

async function database() {
  const db = openDatabase();
  await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT);
    INSERT INTO agents VALUES ('worker-1', 'completed'), ('worker-2', 'completed'),
      ('worker-3', 'completed'), ('worker-4', 'completed');`);
  await store.ensure(db);
  return db;
}

function report(answer = 'Verified worker answer.', outcome = 'success') {
  return { outcome, claims: [{ statement: answer, evidence: ['test://worker-result'] }] };
}

async function persistEvidence(db, input) {
  const binding = { schema: 'test-binding/v1', runId: input.runId,
    missionId: input.missionId, workerId: input.workerId };
  const event = { id: input.eventId || `event-${input.runId}`, eventType: 'AGENT_COMPLETED',
    payload: { executionRunId: input.runId, evidenceReport: input.report } };
  const eventHash = digest(event);
  const evidence = { report: input.report, noAnswerProof: null, terminalEvent: 'AGENT_COMPLETED',
    observations: [eventHash], hash: digest({ report: input.report, proof: null }) };
  const receipt = { schema: 'test-receipt/v1', receiptId: `receipt-${input.runId}`,
    runId: input.receiptRunId || input.runId, missionId: input.receiptMissionId || input.missionId,
    workerId: input.receiptWorkerId || input.workerId, bindingHash: digest(binding),
    result: { status: input.runStatus || 'completed', verified: input.verified !== false }, evidence };
  await insertBinding(db, input, binding);
  if (input.observation !== false) await insertObservation(db, input, { event, eventHash });
  if (input.receipt !== false) await insertReceipt(db, input, receipt);
}

async function insertBinding(db, input, binding) {
  const hash = input.tamper === 'binding' ? digest({ bad: true }) : digest(binding);
  await db.run(`INSERT INTO biological_worker_bindings
    (run_id, mission_id, agent_id, binding_hash, binding_json) VALUES (?, ?, ?, ?, ?)`,
  input.runId, input.missionId, input.workerId, hash, JSON.stringify(binding));
}

async function insertObservation(db, input, observation) {
  const hash = input.tamper === 'observation' ? digest({ bad: true }) : observation.eventHash;
  await db.run(`INSERT INTO biological_worker_observations
    (run_id, event_key, event_hash, event_json, applied) VALUES (?, ?, ?, ?, 1)`,
  input.runId, observation.event.id, hash, JSON.stringify(observation.event));
}

async function insertReceipt(db, input, receipt) {
  const hash = input.tamper === 'receipt' ? digest({ bad: true }) : digest(receipt);
  await db.run(`INSERT INTO biological_worker_receipts
    (receipt_id, run_id, mission_id, payload_hash, receipt_json) VALUES (?, ?, ?, ?, ?)`,
  receipt.receiptId, input.runId, input.missionId, hash, JSON.stringify(receipt));
}

async function verifiedResult(db) {
  const member = { workerId: 'worker-1', role: 'solver', status: 'completed' };
  await persistEvidence(db, { workerId: member.workerId, missionId: 'mission-current',
    runId: 'run-current', report: report(), eventId: 7 });
  await reader.readAll(db, { members: [member], missionId: 'mission-current' });
  assert.deepEqual(member.result, {
    workerId: 'worker-1', role: 'solver', status: 'completed', verified: true,
    answer: 'Verified worker answer.', evidenceEventId: 7, outcome: 'success'
  });
  const output = buildBiologicalOutput({
    context: { orchestratorId: 'orchestrator', dispatchFailures: [] },
    mode: 'biocenose', mission: 'answer', members: [member], accepted: [member], topology: {}
  }).biologicalMode;
  assert.equal(output.status, 'completed');
  assert.match(output.answer, /Verified worker answer/);
}

async function reusedWorkerCannotReuseOldSuccess(db) {
  await persistEvidence(db, { workerId: 'worker-2', missionId: 'mission-old',
    runId: 'run-old', report: report('Old success.') });
  await persistEvidence(db, { workerId: 'worker-2', missionId: 'mission-new',
    runId: 'run-new', report: report('New failure.', 'failure'), verified: false });
  const member = { workerId: 'worker-2', role: 'reviewer', status: 'completed' };
  await reader.readAll(db, { members: [member], missionId: 'mission-new' });
  assert.equal(member.result.status, 'unverified');
  assert.equal(member.result.verified, false);
  assert.equal(member.result.answer, 'New failure.');
  assert.notEqual(member.result.answer, 'Old success.');
}

async function mismatchedAuthorityFailsClosed(db) {
  await persistEvidence(db, { workerId: 'worker-3', missionId: 'mission-mismatch',
    runId: 'run-mismatch', receiptMissionId: 'mission-other', report: report('Wrong mission.') });
  const member = { workerId: 'worker-3', role: 'reviewer', status: 'completed' };
  await reader.readAll(db, { members: [member], missionId: 'mission-mismatch' });
  assert.equal(member.result.status, 'unverified');
  assert.equal(member.result.answer, null);
}

async function absentAndAlteredEvidenceFailClosed() {
  const defects = ['missing-receipt', 'missing-observation', 'tampered-receipt',
    'tampered-observation', 'wrong-run', 'wrong-worker'];
  for (const defect of defects) {
    const db = await database();
    const input = { workerId: 'worker-4', missionId: `mission-${defect}`,
      runId: `run-${defect}`, report: report(defect) };
    if (defect === 'missing-receipt') input.receipt = false;
    if (defect === 'missing-observation') input.observation = false;
    if (defect === 'tampered-receipt') input.tamper = 'receipt';
    if (defect === 'tampered-observation') input.tamper = 'observation';
    if (defect === 'wrong-run') input.receiptRunId = 'run-other';
    if (defect === 'wrong-worker') input.receiptWorkerId = 'worker-other';
    await persistEvidence(db, input);
    const member = { workerId: 'worker-4', role: 'auditor', status: 'completed' };
    await reader.readAll(db, { members: [member], missionId: input.missionId });
    assert.equal(member.result.status, 'unverified', defect);
    assert.equal(member.result.answer, null, defect);
    await db.close();
  }
}

async function specializedResultCanOnlyDowngrade(db) {
  const member = { workerId: 'worker-1', role: 'population', status: 'completed',
    result: { status: 'completed', verified: false, methodValidated: false,
      answer: 'Stale specialized answer.' } };
  await reader.readAll(db, { members: [member], missionId: 'mission-current' });
  assert.equal(member.result.status, 'unverified');
  assert.equal(member.result.verified, false);
  assert.equal(member.result.methodValidated, false);
  assert.equal(member.result.answer, 'Verified worker answer.');
}

function conditionRequiresCompletedWorkers() {
  const complete = { biologicalMode: { complete: true, status: 'completed',
    dispatchFailures: [], members: [{ status: 'completed' }] } };
  assert.equal(handleBiologicalCondition('biocenose', complete), false);
  complete.biologicalMode.members[0].status = 'error';
  assert.equal(handleBiologicalCondition('biocenose', complete), true);
  complete.biologicalMode.members[0].status = 'completed';
  complete.biologicalMode.dispatchFailures.push({ role: 'reviewer', reason: 'spawn failed' });
  assert.equal(handleBiologicalCondition('biocenose', complete), true);
}

async function main() {
  const db = await database();
  await verifiedResult(db);
  await reusedWorkerCannotReuseOldSuccess(db);
  await mismatchedAuthorityFailsClosed(db);
  await specializedResultCanOnlyDowngrade(db);
  conditionRequiresCompletedWorkers();
  await db.close();
  await absentAndAlteredEvidenceFailClosed();
  console.log('Worker result reader: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
