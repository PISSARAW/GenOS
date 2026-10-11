'use strict';

const assert = require('node:assert/strict');
const inbox = require('../src/services/localRuntimeObservationInbox');
const observedGeneration = require('../src/services/localRuntimeObservedGeneration');

const reference = 'dependency:run-1:1:state.txt';
const receipt = { runId: 'run-1', planRevision: 1, target: 'state.txt',
  digest: 'a'.repeat(64), evidenceRef: reference };

function prepare() {
  inbox.bind('agent-a');
  assert.equal(inbox.accept({ type: 'genos-observation-update', agentId: 'agent-a',
    runId: 'run-1', planRevision: 1, observations: [receipt] }), true);
  return { baseFramedPrompt: 'Mission', framedPrompt: 'Mission',
    executionBudget: { latencyMs: 2000 }, autonomyPlan: {} };
}

function tools(replies, events) {
  return { checkpoint: { async save() {} }, synthesis: { canonicalGeneration: () => null },
    createGeneration: () => ({ generation: Promise.resolve(replies.shift()), fallback: { used: false } }),
    awaitGeneration: (_state, generation) => generation,
    validateGeneration: () => {}, emitEvent: (_state, event) => events.push(event) };
}

async function main() {
  const events = [];
  const state = prepare();
  const replies = ['{"claim":"old"}', `{"claim":"new","evidence":"${reference}"}`];
  const reply = await observedGeneration.generate(state, tools(replies, events));
  assert.ok(reply.includes(reference));
  assert.equal(events.filter((event) => event.eventType === 'LOCAL_GENERATION_REBASED').length, 1);
  assert.equal(events.at(-1).payload.replyMentionsLatestEvidenceRef, true);

  const rejected = prepare();
  const rejectedEvents = [];
  await assert.rejects(observedGeneration.generate(rejected,
    tools(Array(4).fill('{"claim":"old"}'), rejectedEvents)), /not cited/);
  assert.equal(rejectedEvents.some((event) => event.eventType === 'LOCAL_GENERATION_REBASED'), false);
  console.log('Local observed generation: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
