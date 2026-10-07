'use strict';

const assert = require('node:assert/strict');
const executor = require('../../src/services/epistemic/oracleNativeProcess');

async function subsetDispatch(db) {
  const result = await require('../../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Compute the scoped subset sum', workerKind: 'bounded_worker',
      methodContract: require('./nativeWorkerFixtures').scoped, timeoutMs: 60000 });
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, row.id);
  return { row, result, request: { runId: row.id, agentId: row.agent_id, scope: authority.envelope.scope } };
}

async function subjectMutation(db, assertAborted) {
  const original = executor.run;
  let injected = false;
  let injectionFailure;
  executor.run = async (subject, options) => {
    const result = await original(subject, options);
    if (!injected) {
      injected = true;
      try { await mutateObservation(db, subject); }
      catch (failure) { injectionFailure = failure; throw failure; }
    }
    return result;
  };
  let checked;
  try { checked = await subsetDispatch(db); }
  finally { executor.run = original; }
  if (injectionFailure) throw injectionFailure;
  assert.equal(injected, true);
  await assertAborted(db, checked, 'ORACLE_SUBJECT_CHANGED');
}

async function mutateObservation(db, subject) {
  const row = await db.get('SELECT * FROM biological_worker_observations WHERE run_id=? AND applied=1 ORDER BY rowid DESC LIMIT 1', subject.runId);
  const event = JSON.parse(row.event_json);
  assert.equal(event.eventType, 'EVIDENCE_REPORT');
  event.id = require('node:crypto').randomUUID();
  event.timestamp = new Date().toISOString();
  event.payload.evidenceReport.workerArtifact.content.result.sum += 1;
  await require('../../src/services/strategyExecutionService').recordExecutionEvent(db, subject.workerId, event);
  const saved = await require('../../src/services/biologicalWorkerStore').observation(db,
    { runId: subject.runId, eventKey: event.id });
  assert.equal(saved.applied, 1);
}

async function budgetExpiry(db, assertAborted) {
  const original = executor.run;
  const clock = Date.now;
  let injected = false;
  executor.run = async (subject, options) => {
    const result = await original(subject, options);
    if (!injected) {
      injected = true;
      Date.now = () => Date.parse(result.detail.startedAt) + result.detail.timeoutMs + 1000;
    }
    return result;
  };
  let checked;
  try { checked = await subsetDispatch(db); }
  finally { executor.run = original; Date.now = clock; }
  assert.equal(injected, true);
  await assertAborted(db, checked, 'ORACLE_BUDGET_EXPIRED');
}

module.exports = { subjectMutation, budgetExpiry, subsetDispatch };
