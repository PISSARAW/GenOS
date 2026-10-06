'use strict';

const assert = require('node:assert/strict');
const durable = require('../src/services/durableContinuationService');
const originalMark = durable.markContinuation;
durable.markContinuation = async () => {};
const loop = require('../bin/continuationFeedbackLoop.cjs');
const { MAX_HOMEOSTASIS_CONTINUATIONS } = require('../src/services/homeostasisContinuationService');

const db = {
  get: async () => ({ status: 'completed', runtime_pid: null }),
  all: async () => [{ id: 'root', status: 'completed' }]
};

function dispatch(index) {
  return { dispatched: { targetAgentId: `continuation-${index}`, decisionId: `decision-${index}` }, finalVerdict: 'homeostasis_continuation' };
}

function seed() {
  return { completionGate: { allowed: false }, continuity: {}, outcome: { success: false, verdict: 'failed' }, finalVerdict: 'failed' };
}

async function usesExistingDispatch() {
  let extraDispatches = 0;
  const outcome = { success: true, verdict: 'completed', evidence: [{ evidence_ref: 'new-receipt' }] };
  const result = await loop.runBoundedContinuationLoop({
    db, id: 'root', task: 'recover', seed: seed(), firstDispatch: dispatch(0),
    dispatchOne: async () => { extraDispatches += 1; return dispatch(1); },
    summarizeAgents: () => outcome,
    evaluateMissionContinuity: async () => ({ outcome, mission: { id: 'm1' }, completionGate: { allowed: true }, evaluation: { status: 'homeostasis_satisfied' }, continuity: { evidence: ['new-receipt'] } })
  });
  assert.equal(extraDispatches, 0, 'an already dispatched continuation must be awaited rather than dispatched twice');
  assert.equal(result.finalVerdict, 'completed');
  assert.equal(result.outcome, outcome);
  assert.equal(result.mission.id, 'm1');
  assert.equal(result.continuity.rounds.length, 1);
  assert.deepEqual(result.continuity.evidence, ['new-receipt']);
}

async function boundsAllRounds() {
  let count = 1;
  const result = await loop.runBoundedContinuationLoop({
    db, id: 'root', task: 'recover', seed: seed(), firstDispatch: dispatch(0),
    dispatchOne: async () => dispatch(count++),
    summarizeAgents: () => ({ success: false, verdict: 'failed' }),
    evaluateMissionContinuity: async () => ({ completionGate: { allowed: false }, evaluation: { status: 'evidence_missing' } })
  });
  assert.equal(count, MAX_HOMEOSTASIS_CONTINUATIONS);
  assert.equal(result.continuity.rounds.length, MAX_HOMEOSTASIS_CONTINUATIONS);
  assert.equal(result.continuity.budgetExhausted, true);
  assert.equal(result.finalVerdict, 'homeostasis_exhausted');
}

async function stopsAfterEvaluationError() {
  let count = 0;
  const result = await loop.runBoundedContinuationLoop({
    db, id: 'root', task: 'recover', seed: seed(), firstDispatch: dispatch(0),
    dispatchOne: async () => { count += 1; return dispatch(count); },
    summarizeAgents: () => ({ success: false, verdict: 'failed' }),
    evaluateMissionContinuity: async () => { throw new Error('unavailable evidence database'); }
  });
  assert.equal(count, 0);
  assert.equal(result.finalVerdict, 'homeostasis_blocked');
  assert.equal(result.completionGate.allowed, false);
}

async function main() {
  try {
    await usesExistingDispatch();
    await boundsAllRounds();
    await stopsAfterEvaluationError();
    console.log('Orchestrator continuation: one initial dispatch, refreshed outcome, bounded recovery and failed evaluation passed.');
  } finally { durable.markContinuation = originalMark; }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
