'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { workerSchema, addWorker, completion } = require('./helpers/biologicalWorkerFixture');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const execution = require('../src/services/strategyExecutionService');
const ledger = require('../src/services/modelAttemptLedger');
const observer = require('../src/services/missionActionModelObservation');
const workerStore = require('../src/services/biologicalWorkerStore');

async function main() {
  const db = openDatabase();
  try {
    await workerSchema(db);
    await db.exec(TABLES_MODEL_ATTEMPTS);
    const contractRecord = await addWorker(db);
    const run = await execution.createExecutionRun(db, { agentId: 'worker',
      contractRecord, budget: { tokens: 100, costUsd: 1, latencyMs: 60000, events: 20 } });
    const identity = ledger.attemptIdentity({ executionRunId: run.id, routeActionId: 'action-1',
      agentId: 'worker', organizationId: 'org', projectId: 'project' }, 'openai://fixture');
    await ledger.startAttempt(db, identity);
    await ledger.finishAttempt(db, { ...identity, status: 'completed', providerCalled: true,
      inputTokens: 5, outputTokens: 3, tokenUsageSource: 'provider', costUsd: 0.000022 });
    const recorded = await observer.observe(db, {
      action: { id: 'action-1', kind: 'small_model' },
      request: { executionRunId: run.id, agentId: 'worker' },
      binding: { scope: { organizationId: 'org', projectId: 'project' } },
      result: { routeAttemptId: identity.id }
    });
    assert.equal(recorded.recorded, true);
    const finished = await execution.recordExecutionEvent(db, 'worker',
      completion(run.id, { usage: { total_tokens: 0, cost_usd: 0 } }));
    const receipt = finished.biologicalReceipt;
    assert.equal(receipt.costs[0].quantity, 8);
    assert.equal(receipt.costs[1].quantity, 0.000022);
    assert.equal(receipt.accounting.consistent, true);
    assert.equal(receipt.budgetAssessment.satisfied, true);
    const observations = await workerStore.observations(db, run.id);
    assert(observations.some((item) => item.event.eventType === 'MODEL_USAGE_OBSERVED'
      && receipt.evidence.observations.includes(item.hash)));
    assert.equal(await require('../src/services/routeMissionOutcomeBridge').ingest(db, run.id), null,
      'A sealed cost receipt without an independent native oracle cannot train the router');
  } finally { await db.close(); }
  console.log('Fixture model usage is sealed in a worker receipt; AEIS learning remains gated.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
