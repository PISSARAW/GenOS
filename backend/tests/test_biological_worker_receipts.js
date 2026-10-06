'use strict';
const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { workerSchema, addWorker, completion } = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const store = require('../src/services/biologicalWorkerStore');
const biology = require('../src/services/biologicalWorkerReceiptService');

async function measuredExecution(db) {
  const contractRecord = await addWorker(db);
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord });
  const binding = await store.binding(db, run.id);
  assert.equal(binding.missionId, 'worker-mission');
  assert.equal(binding.workerId, 'worker');
  assert.equal(binding.runtime, 'node-worker');
  const event = completion(run.id);
  const first = await execution.recordExecutionEvent(db, 'worker', event);
  assert.equal(first.biologicalReceipt.result.verified, true);
  assert.equal(first.biologicalReceipt.genomeHash, binding.genomeHash);
  assert.equal(first.biologicalReceipt.costs[0].quantity, 3);
  assert.equal(first.biologicalReceipt.costs[1].quantity, 0.01);
  assert.equal(first.biologicalReceipt.costs[0].unit, 'token');
  const repeated = await execution.recordExecutionEvent(db, 'worker', event);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.run.metrics.tokens, 3, 'replay does not charge the same event twice');
  await assert.rejects(execution.recordExecutionEvent(db, 'worker', { ...event,
    payload: { ...event.payload, usage: { total_tokens: 4 } } }), { code: 'BIOLOGICAL_WORKER_EVENT_CONFLICT' });
  await assert.rejects(db.run('UPDATE biological_worker_bindings SET binding_json = ?', '{}'), /Immutable/);
  await assert.rejects(db.run('DELETE FROM biological_worker_receipts'), /Immutable/);
  assert.equal((await biology.missionEvidence(db, 'worker-mission')).satisfied, true);
}

async function refusals(db) {
  const contractRecord = await addWorker(db, { agentId: 'failed-worker' });
  const run = await execution.createExecutionRun(db, { agentId: 'failed-worker', contractRecord });
  await assert.rejects(execution.recordExecutionEvent(db, 'worker', completion(run.id)), { code: 'BIOLOGICAL_WORKER_RUN_OWNER_MISMATCH' });
  await assert.rejects(execution.recordExecutionEvent(db, 'failed-worker', completion(run.id, { usage: { total_tokens: -1 } })),
    { code: 'BIOLOGICAL_WORKER_COST_INVALID' });
  const result = await execution.recordExecutionEvent(db, 'failed-worker', completion(run.id, {
    eventType: 'AGENT_FAILED', usage: { total_tokens: 2, cost_usd: 0.02 }
  }));
  assert.equal(result.biologicalReceipt.result.completed, false);
  assert.equal(result.biologicalReceipt.costs[0].quantity, 2, 'failed work retains its observed cost');
  assert.equal((await biology.missionEvidence(db, 'worker-mission')).satisfied, false);
}

async function missingCosts(db) {
  const contractRecord = await addWorker(db, { agentId: 'unknown-cost' });
  const run = await execution.createExecutionRun(db, { agentId: 'unknown-cost', contractRecord });
  const result = await execution.recordExecutionEvent(db, 'unknown-cost', completion(run.id, { usage: {} }));
  assert.equal(result.biologicalReceipt.costs[0].quantity, null);
  assert.equal(result.biologicalReceipt.costs[0].measurement, 'unavailable');
  assert.equal(result.biologicalReceipt.budgetAssessment.satisfied, false);
}

async function main() {
  const db = openDatabase();
  try { await workerSchema(db); await measuredExecution(db); await refusals(db); await missingCosts(db); }
  finally { await db.close(); }
  console.log('Worker mission, frozen genome, measured costs, immutable outcome and idempotency passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
