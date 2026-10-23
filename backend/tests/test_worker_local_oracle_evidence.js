'use strict';

const assert = require('node:assert/strict');
const state = require('../src/services/agentOrchestrationState');
const execution = require('../src/services/strategyExecutionService');
const coordinator = require('../src/services/epistemic/nativeOracleCoordinator');
const originalEmit = state.emit;
const originalRecord = execution.recordExecutionEvent;
const originalPrepare = coordinator.prepare;
const emitted = [];
const recorded = [];
const prepared = [];

state.emit = (...args) => { const event = { eventType: args[1], action: args[2], payload: args[4] }; emitted.push(event); return event; };
execution.recordExecutionEvent = async (_db, _agentId, event) => { recorded.push(event); return { halt: false }; };
coordinator.prepare = async (_db, request) => { prepared.push(request); return { eventId: 'oracle-event', hash: 'a'.repeat(64) }; };

async function main() {
  const result = await require('../src/services/workerCodeOracleLocal').prepare({ db: {},
    mission: { agentId: 'worker-local', workerContract: { mission: { methodContract: { methodId: 'prompt_defined' } } } },
    executionRun: { id: 'run-local' }, evidenceReport: { outcome: 'success', claims: [] } });
  assert.equal(result.hash, 'a'.repeat(64));
  assert.equal(emitted[0].eventType, 'EVIDENCE_REPORT');
  assert.equal(emitted[0].action, 'LOCAL_REVIEW');
  assert.equal(recorded[0], emitted[0], 'the evidence report is applied before oracle reservation');
  assert.deepEqual(prepared, [{ agentId: 'worker-local', runId: 'run-local' }]);
  process.stdout.write('Local worker evidence is persisted before native oracle verification: PASS\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { state.emit = originalEmit; execution.recordExecutionEvent = originalRecord; coordinator.prepare = originalPrepare; });
