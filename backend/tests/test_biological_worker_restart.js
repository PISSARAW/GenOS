'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const fixture = require('./helpers/realWorkerFixture.cjs');
const store = require('../src/services/biologicalWorkerStore');
const homeostasis = require('../src/services/homeostasisService');
const identity = require('../src/services/missionIdentityService');
const methodContract = { version: 1, methodId: 'scoped_procedure', parameters: {
  procedure: { version: 1, methodId: 'subset_sum', parameters: { values: [2, 3, 7], target: 5 } }
} };

async function completed(value) {
  const result = await fixture.dispatch(value, { payload: { methodContract } });
  assert.equal(result.code, 0, result.stderr + result.stdout);
  const row = await value.db.get("SELECT * FROM biological_worker_bindings ORDER BY rowid DESC LIMIT 1");
  const receipt = await store.receipt(value.db, row.run_id);
  assert.equal(receipt.result.verified, true, JSON.stringify(receipt));
  assert.equal(receipt.semanticVerification.accepted, true);
  assert.equal(receipt.oracleExecution.costs.processes, 2);
  const current = await require('../src/services/homeostasisAuthorityStore').active(value.db, row.mission_id);
  const target = { mission: { id: row.mission_id, expectedHomeostasisRevision: current?.revision, completionContract: {
    requiredEvidence: ['biological_worker_receipt'],
    invariants: [{ id: 'checked', verifier: { type: 'context.flag', flag: 'checked' } }]
  } }, context: { flags: { checked: true } } };
  const allowed = await homeostasis.transitionMissionToComplete(value.db, target);
  assert.equal(allowed.allowed, true, JSON.stringify(allowed));
  await require('../src/services/homeostasisClosureService').assertClosure(value.db, row.mission_id);
  return { row, receipt, target };
}

async function interrupted(value, previous) {
  const mission = await identity.create(value.db, { objective: 'Recover the observed native completion',
    orchestratorAgentId: 'mcp_orchestrator_real_test' });
  const target = { ...previous.target, mission: { ...previous.target.mission,
    id: mission.missionId, expectedHomeostasisRevision: 0 } };
  await homeostasis.evaluateMissionHomeostasis(value.db, target);
  const result = await fixture.dispatch(value, { mode: 'crash',
    payload: { methodContract, missionId: mission.missionId } });
  assert.equal(result.code, 77, result.stderr + result.stdout);
  const pending = result.interruption;
  assert.equal(await store.receipt(value.db, pending.runId), null,
    'a process killed after observation cannot manufacture its final receipt');
  const observed = await store.observations(value.db, pending.runId);
  const terminal = observed.find(item => item.event.eventType === 'AGENT_COMPLETED');
  assert.equal(terminal.applied, false);
  await assert.rejects(value.db.run("UPDATE missions SET status='completed' WHERE mission_id=?", mission.missionId),
    /receipt required/);
  return { ...pending, missionId: mission.missionId, target };
}

async function afterRestart(value, previous, pending) {
  await require('../src/services/garageRuntimeService').stop(value.db);
  await require('../src/db').closeDatabase();
  value.db = await require('../src/db').getDatabase(process.env.GENOS_DB_PATH);
  await require('../src/services/biologicalWorkerReceiptService').recover(value.db, pending.missionId);
  const receipt = await store.receipt(value.db, pending.runId);
  assert.equal(receipt.result.verified, true, JSON.stringify(receipt));
  assert.equal(receipt.semanticVerification.accepted, true);
  const observations = await store.observations(value.db, pending.runId);
  assert.equal(observations.find(item => item.event.eventType === 'AGENT_COMPLETED').applied, true);
  const denied = await homeostasis.transitionMissionToComplete(value.db, {
    mission: { id: pending.missionId }, context: { missionOutcome: true } });
  assert.equal(denied.allowed, false, 'restart cannot weaken the frozen checked invariant');
  const allowed = await homeostasis.transitionMissionToComplete(value.db, pending.target);
  assert.equal(allowed.allowed, true, JSON.stringify(allowed));
  assert.equal((await identity.setStatus(value.db, pending.missionId, 'completed')).status, 'completed');
  const count = (await value.db.all('SELECT nonce FROM verifier_receipt_nonces')).length;
  await require('../src/services/biologicalWorkerReceiptService').recover(value.db, pending.missionId);
  assert.equal((await value.db.all('SELECT nonce FROM verifier_receipt_nonces')).length, count,
    'recovery cannot consume the independent verifier nonces twice');
}

async function main() {
  const value = await fixture.fixture({ 'task.txt': 'A real source-bound restart test.' });
  try {
    const previous = await completed(value);
    const pending = await interrupted(value, previous);
    await afterRestart(value, previous, pending);
  } finally { await fixture.close(value); }
  console.log('Real worker, signed two-process oracle, abrupt exit, durable replay and strict closure: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
