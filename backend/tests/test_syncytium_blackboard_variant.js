'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const board = await syncytium.createBlackboardSession('Shared problem-solving workspace.');
  const problem = await syncytium.postProblem(board.sessionId, {
    opId: 'board-problem-op', eventId: 'problem-1', actorId: 'coordinator',
    payload: { title: 'Parser regression', priority: 'high' }
  });
  assert.equal(problem.event.eventType, 'new_problem');

  await syncytium.postEvidence(board.sessionId, {
    opId: 'board-evidence-op', eventId: 'evidence-1', actorId: 'tester', respondsTo: 'problem-1',
    payload: { test: 'nested-expression', result: 'fails' }
  });
  await syncytium.requestVerification(board.sessionId, {
    opId: 'board-verify-op', eventId: 'verify-1', actorId: 'reviewer', respondsTo: 'problem-1',
    payload: { method: 'independent-replay' }
  });
  await syncytium.reportUnresolvedDependency(board.sessionId, {
    opId: 'board-dependency-op', eventId: 'dependency-1', actorId: 'builder',
    payload: { package: 'parser-core', reason: 'missing compatibility contract' }
  });
  await syncytium.publishBlackboardResult(board.sessionId, {
    opId: 'board-result-op', eventId: 'result-1', actorId: 'fixer', respondsTo: 'problem-1',
    payload: { patch: 'fix-42', status: 'ready-for-review' }
  });

  const all = await syncytium.readBlackboard(board.sessionId);
  assert.equal(all.blackboard.length, 5);
  assert.equal(all.blackboard.find((event) => event.eventId === 'result-1').respondsTo, 'problem-1');
  assert.equal((await syncytium.readBlackboard(board.sessionId, { eventType: 'request_verification' })).blackboard.length, 1);
  assert.equal(all.shared.sharedFields.events.length, 5);

  await assert.rejects(() => syncytium.postProblem(board.sessionId, {
    opId: 'bad-blackboard-op', actorId: 'agent', payload: 'not structured'
  }), (error) => error.code === 'SYNCYTIUM_BLACKBOARD_EVENT_INVALID');
  await assert.rejects(() => syncytium.readBlackboard(board.sessionId, { eventType: 'unknown' }),
    (error) => error.code === 'SYNCYTIUM_BLACKBOARD_EVENT_INVALID');
}

main().then(() => console.log('Syncytium blackboard variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
