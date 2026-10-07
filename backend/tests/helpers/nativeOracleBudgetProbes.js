'use strict';

const assert = require('node:assert/strict');
const contracts = require('../../src/services/strategyContractService');
const execution = require('../../src/services/strategyExecutionService');
const journal = require('../../src/services/epistemic/nativeOracleJournal');
const { scoped } = require('./nativeWorkerFixtures');

async function dispatch(db, method) {
  const result = await require('../../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Compute bounded subset sum', workerKind: 'bounded_worker', methodContract: method, timeoutMs: 60000 });
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, row.id);
  const request = { runId: row.id, agentId: result.childAgentId, scope: authority.envelope.scope };
  return { result, row, request, authority };
}

async function qualify(db) {
  const saved = await contracts.getLatestContract(db, 'delegation-root');
  const tighter = structuredClone(saved.contract);
  tighter.promotion.native_verification.executions = 1;
  await contracts.saveContract(db, { agentId: 'delegation-root', workspaceId: 'delegation-ws', contract: tighter });
  const insufficient = await dispatch(db, scoped);
  assert.equal(insufficient.result.success, false);
  assert.equal(insufficient.row.status, 'failed');
  assert.equal(await journal.read(db, { ...insufficient.request, kind: 'reservation' }), null);
  assert.equal(await journal.read(db, { ...insufficient.request, kind: 'attestation' }), null);
  const failure = await db.get("SELECT payload_json FROM telemetry_events WHERE agent_id=? AND event_type='AGENT_FAILED' ORDER BY id DESC LIMIT 1",
    insufficient.request.agentId);
  assert.equal(JSON.parse(failure.payload_json).failure.code, 'ORACLE_BUDGET_UNAVAILABLE');
  assert.throws(() => execution.compileExecutionPlan(tighter, { verification: { executions: 2, latencyMs: 1000 } }),
    { code: 'ORACLE_BUDGET_INVALID' });
  assert.equal(execution.compileExecutionPlan(saved.contract, { latencyMs: 1000 }).budget.verification.latencyMs, 1000);
  await contracts.saveContract(db, { agentId: 'delegation-root', workspaceId: 'delegation-ws', contract: saved.contract });
  const outside = structuredClone(scoped);
  outside.parameters.procedure.parameters = { values: Array(21).fill(1), target: 10 };
  const rejected = await dispatch(db, outside);
  assert.equal(rejected.result.success, false);
  assert.equal(rejected.row.status, 'blocked');
  assert.equal(rejected.row.guardrail_reason, 'ORACLE_ASSEMBLY_NOT_ACCEPTED');
  const attested = await journal.read(db, { ...rejected.request, kind: 'attestation' });
  assert.equal(attested.value.accepted, false);
  assert.equal(attested.value.costs.processes, 2);
  assert.equal(await journal.read(db, { ...rejected.request, kind: 'acceptance' }), null);
  console.log('Native budgets: insufficient grant executes no oracle; requested escalation and missing independent quorum refuse completion.');
}

module.exports = { qualify };
