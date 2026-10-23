'use strict';

const assert = require('node:assert/strict');
const state = require('../src/services/agentOrchestrationState');
const recovery = require('../src/services/agentRecoveryService');

const events = [];
const queued = [];
state.updateAgent = async () => {};
state.emit = (...args) => {
  const event = { eventType: args[1], detail: args[3], payload: args[4] };
  events.push(event);
  return event;
};
recovery.queueWorkerRecovery = (mission, event) => queued.push({ mission, event });

const { emitLocalCompleted } = require('../src/services/workerEvidenceBarrierLocalCompletion');

async function main() {
  const mission = { agentId: 'worker-unresolved', role: 'resource_steward' };
  const failed = await emitLocalCompleted({
    mission, unresolved: true, eventType: 'AGENT_FAILED', kind: 'EVIDENCE_GAP',
    detail: 'Local worker reported that the supplied evidence cannot substantiate the requested outcome.',
    statusText: 'Unresolved: insufficient evidence', executionRun: { id: 'run-unresolved' },
    model: 'ollama://qwen2.5-coder:7b', provider: 'ollama', usage: { tokens: 100 },
    evidenceReport: { outcome: 'unresolved', claims: [], uncertainties: ['No valid partition found'] }
  }, async () => {});
  assert.equal(queued.length, 1, 'an unresolved model answer must enter bounded recovery');
  assert.equal(queued[0].mission, mission);
  assert.equal(queued[0].event, failed);

  const completed = await emitLocalCompleted({
    mission: { agentId: 'worker-complete' }, unresolved: false, eventType: 'AGENT_COMPLETED',
    kind: 'LOCAL_REVIEW', detail: 'Completed', statusText: 'Local review completed',
    evidenceReport: { outcome: 'success', claims: [] }
  }, async () => {});
  assert.equal(queued.length, 1, 'a completed answer must not enter failure recovery');
  assert.equal(completed.eventType, 'AGENT_COMPLETED');
  assert.equal(events.length, 2);
  process.stdout.write('Unresolved worker evidence queues bounded recovery: PASS\n');
}

main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
