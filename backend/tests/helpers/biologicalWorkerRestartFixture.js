'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'biological-restart-ledger-test-only';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'biological-restart-receipt-test-only';

const path = require('node:path');
const { workerSchema, addWorker } = require('./biologicalWorkerFixture');
const execution = require('../../src/services/strategyExecutionService');

async function setup(db) {
  await workerSchema(db);
  await db.exec(`ALTER TABLE agents ADD COLUMN status TEXT DEFAULT 'running';
    ALTER TABLE agents ADD COLUMN isolation_mode TEXT;
    ALTER TABLE mission_agents ADD COLUMN role TEXT DEFAULT 'worker';`);
  await require('../../src/db/migrations/migrateAeisAuthority').migrateAeisAuthority(db);
  const contractRecord = await addWorker(db, { promotion: { require_independent_verification: true,
    native_verification: { executions: 2, latencyMs: 30000 } } });
  const workerContract = require('../../src/services/agents/workerKindService').buildWorkerContract('procedural_executor', {
    parentAgentId: 'parent', prompt: 'Compute a bounded subset sum',
    methodContract: { version: 1, methodId: 'subset_sum', parameters: { values: [2, 3, 7], target: 5 } } });
  await db.run("UPDATE agents SET metadata_json = ? WHERE id = 'worker'", JSON.stringify({ workerContract }));
  return contractRecord;
}

async function createRun(db, filename, contractRecord) {
  const run = await execution.createExecutionRun(db, { agentId: 'worker', missionId: 'worker-mission',
    contractRecord, budget: { tokens: 0, deterministic: true, latencyMs: 60000 } });
  await require('../../src/services/missionEnvelopeAuthority').seal({
    db, agentId: 'worker', executionRun: run, contractRecord, autonomyPlan: {}, executable: process.execPath,
    normalizedMission: { agentId: 'worker', missionId: 'worker-mission',
      workspaceRoot: path.join(path.dirname(filename), 'workspace'), toolLease: [], timeoutMs: 60000 } });
  return run;
}

async function observeAndVerify(db, run, report) {
  const event = { id: `evidence-${run.id}`, eventType: 'EVIDENCE_REPORT', timestamp: new Date().toISOString(),
    payload: { executionRunId: run.id, evidenceReport: report, usage: { total_tokens: 0, cost_usd: 0 } } };
  await execution.recordExecutionEvent(db, 'worker', event);
  return require('../../src/services/epistemic/nativeOracleCoordinator').prepare(db, { agentId: 'worker', runId: run.id });
}

module.exports = { setup, createRun, observeAndVerify };
