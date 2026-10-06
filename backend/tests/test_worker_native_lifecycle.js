'use strict';

const assert = require('node:assert/strict');
const { method, scoped, missionFor } = require('./helpers/nativeWorkerFixtures');
const state = require('../src/services/agentOrchestrationState');
const strategy = require('../src/services/strategyExecutionService');
const evidence = require('../src/services/agentEvidenceService');
const statuses = [];
const events = [];
const writes = [];
let haltEvidence = false;
state.updateAgent = async (_id, status) => { statuses.push(status); return true; };
state.emit = (...args) => {
  const [, eventType, , , payload] = args;
  const event = { eventType, payload };
  events.push(event);
  return event;
};
evidence.recordWorkerEvidence = (_mission, event) => writes.push(`memory:${event.eventType}`);
strategy.recordExecutionEvent = async (_db, _agentId, event) => {
  writes.push(`database:${event.eventType}`);
  return { halt: haltEvidence && event.eventType === 'EVIDENCE_REPORT', reason: 'test guard' };
};
const { runDeterministicWorker } = require('../src/services/agents/deterministicWorkerRuntime');

function reset() {
  events.length = 0;
  statuses.length = 0;
  writes.length = 0;
}

async function main() {
  const mission = missionFor('bounded_worker', scoped, process.cwd());
  const run = { id: 'native-run' };
  const passed = await runDeterministicWorker({}, mission, run);
  assert.equal(passed.started, true);
  assert.deepEqual(statuses, ['running', 'completed']);
  assert.deepEqual(events.map((item) => item.eventType), ['DETERMINISTIC_WORKER_STARTED', 'EVIDENCE_REPORT', 'AGENT_COMPLETED']);
  assert.equal(events[2].payload.usage.tokens, 0);
  assert.ok(writes.indexOf('database:EVIDENCE_REPORT') < writes.indexOf('database:AGENT_COMPLETED'));
  reset();
  haltEvidence = true;
  const halted = await runDeterministicWorker({}, mission, run);
  assert.equal(halted.code, 'WORKER_EXECUTION_HALTED');
  assert.equal(events.some((item) => item.eventType === 'AGENT_COMPLETED'), false);
  assert.equal(statuses.at(-1), 'error');
  haltEvidence = false;
  reset();
  state.cancelledStarts.add(mission.agentId);
  const cancelled = await runDeterministicWorker({}, mission, run);
  state.cancelledStarts.delete(mission.agentId);
  assert.equal(cancelled.code, 'MISSION_CANCELLED');
  assert.deepEqual(statuses, ['terminated']);
  reset();
  const expired = { ...mission, workerContract: { ...mission.workerContract, resources: { ...mission.workerContract.resources, maxTimeMs: 0 } } };
  assert.equal((await runDeterministicWorker({}, expired, run)).code, 'WORKER_DEADLINE_EXCEEDED');
  assert.equal(events.some((item) => item.eventType === 'DETERMINISTIC_WORKER_STARTED'), false);
  assert.deepEqual(await require('../src/services/workerPreparationDetails').resolveRoute({ db: {}, parent: {}, assignment: { workerKind: mission.workerKind, methodContract: scoped }, mission: {} }), {});
  reset();
  const altered = { ...mission, methodContract: method('scoped_procedure', { procedure: {
    version: 1, methodId: 'subset_sum', parameters: { values: [1], target: 1 }
  } }) };
  assert.equal((await runDeterministicWorker({}, altered, run)).code, 'WORKER_METHOD_MISMATCH');
  assert.equal(events.some((item) => item.eventType === 'AGENT_COMPLETED'), false);
  console.log('Native lifecycle: evidence persistence, guard halt, cancellation, immutable input and zero usage PASS');
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; });
