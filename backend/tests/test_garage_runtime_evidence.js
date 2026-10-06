'use strict';

const assert = require('assert/strict');
const { fixture, request } = require('./garageFixture');
const store = require('../src/services/garageQueueStore');
const runtime = require('../src/services/garageRuntimeService');
const evidence = require('../src/services/garageRuntimeEvidence');
const { runProcedure } = require('../src/services/agents/deterministicWorkerProcedures');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');

async function verify(test) {
  const workerContract = { identity: { workerKind: 'procedural_executor' }, evidence: { requiredArtifacts: ['dossier'] } };
  const mission = request({ workerContract });
  const queued = await store.enqueuePersistent(test.db, mission);
  const claim = await store.claimNextPersistent(test.db, { orchestratorId: 'orch' });
  await store.updatePersistent(test.db, { requestId: claim.request_id, leaseId: claim.lease_id, status: 'running' });
  const bound = { agentId: 'worker-1', garageRequestId: queued.request_id, garageLeaseId: claim.lease_id };
  await runtime.bindExecution({ db: test.db, normalizedMission: bound, executionRun: { id: 'run-current' } });
  await test.db.run("INSERT INTO strategy_execution_runs(id,agent_id,status,metrics_json) VALUES ('run-current','worker-1','completed','{}')");
  await test.db.run("UPDATE agents SET status = 'completed', metadata_json = ? WHERE id = 'worker-1'", JSON.stringify({ workerContract }));
  const report = reportFor('procedural_executor', runProcedure({ version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } }));
  await test.db.run("INSERT INTO telemetry_events(agent_id,event_type,payload_json) VALUES ('worker-1','AGENT_COMPLETED',?)", JSON.stringify({ executionRunId: 'run-old', evidenceReport: report }));
  let row = await test.db.get('SELECT * FROM garage_queue WHERE request_id = ?', queued.request_id);
  assert.equal(await evidence.receipt(test.db, row), null, 'an old artifact cannot complete a new attempt');
  await assert.rejects(store.updatePersistent(test.db, { requestId: claim.request_id, leaseId: claim.lease_id,
    status: 'completed', evidence: { verified: true, runId: 'run-current', artifactHash: 'forged' } }), { code: 'GARAGE_EVIDENCE_REQUIRED' });
  await test.db.run("INSERT INTO telemetry_events(agent_id,event_type,payload_json) VALUES ('worker-1','AGENT_COMPLETED',?)", JSON.stringify({ executionRunId: 'run-current', evidenceReport: report }));
  const receipt = await evidence.receipt(test.db, row);
  assert.equal(receipt.verified, true);
  assert.match(receipt.artifactHash, /^[a-f0-9]{64}$/);
  await runtime.reconcileOne({ db: test.db }, queued.request_id);
  row = await test.db.get('SELECT * FROM garage_queue WHERE request_id = ?', queued.request_id);
  assert.equal(row.status, 'completed');
  assert.equal(JSON.parse(row.result_json).runId, 'run-current');
}

async function run() {
  const test = await fixture();
  try { await verify(test); }
  finally { await test.close(); }
  console.log('Garage evidence: real deterministic solver, typed artifact, current run binding and forged receipt rejection passed.');
}

run().catch((failure) => { console.error(failure); process.exitCode = 1; });
