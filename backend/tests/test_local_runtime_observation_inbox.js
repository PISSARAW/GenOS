'use strict';

const assert = require('node:assert/strict');
const inbox = require('../src/services/localRuntimeObservationInbox');

function update(agentId, revision, digest) {
  const runId = 'run-1';
  return { type: 'genos-observation-update', agentId, runId, planRevision: revision,
    observations: [{ runId, planRevision: revision, target: 'state.txt', digest,
      evidenceRef: `dependency:${runId}:${revision}:state.txt` }] };
}

inbox.bind('agent-a');
const first = 'a'.repeat(64);
const second = 'b'.repeat(64);
assert.equal(inbox.accept(update('forged-agent', 1, first)), false);
const forgedRun = update('agent-a', 1, first);
forgedRun.observations[0].runId = 'other-run';
assert.equal(inbox.accept(forgedRun), false);
assert.equal(inbox.accept(update('agent-a', 1, first)), true);
assert.equal(inbox.accept({ ...update('agent-a', 2, second), runId: 'other-run' }), false);
assert.equal(inbox.accept(update('agent-a', 1, second)), false);
assert.equal(inbox.accept(update('agent-a', 2, second)), true);
const state = { baseFramedPrompt: 'Original mission', framedPrompt: 'Original mission' };
const events = [];
assert.equal(inbox.apply(state, (_state, event) => events.push(event)), true);
assert.equal(state.observationRevision, 2);
assert.equal(inbox.latestEvidenceRef(), 'dependency:run-1:2:state.txt');
assert.ok(state.framedPrompt.includes(second));
assert.ok(state.framedPrompt.includes('bbbbbbbb'));
assert.equal(events[0].eventType, 'AGENT_PLAN_REVISED');
assert.equal(inbox.apply(state, () => {}), false);
console.log('Local runtime observation inbox: PASS');
