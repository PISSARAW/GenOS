'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const board = await syncytium.createBlackboardSession('Shared problem-solving workspace.');
  const problem = await syncytium.postProblem(board.sessionId, {
    opId: 'board-problem-op', eventId: 'problem-1', actorId: 'coordinator', priority: 20,
    payload: { title: 'Parser regression', priority: 'high' }
  });
  assert.equal(problem.event.eventType, 'new_problem');
  await syncytium.postProblem(board.sessionId, { opId: 'board-priority-op', eventId: 'problem-high',
    actorId: 'coordinator', priority: 80, payload: { title: 'Urgent regression' } });

  await syncytium.postEvidence(board.sessionId, {
    opId: 'board-evidence-op', eventId: 'evidence-1', actorId: 'tester', respondsTo: 'problem-1',
    payload: { test: 'nested-expression', result: 'fails' }
  });
  await syncytium.requestVerification(board.sessionId, {
    opId: 'board-verify-op', eventId: 'verify-1', actorId: 'reviewer', respondsTo: 'problem-1',
    payload: { method: 'independent-replay' }
  });
  await syncytium.requestVerification(board.sessionId, { opId: 'board-verify-open-op', eventId: 'verify-open-1',
    actorId: 'reviewer', respondsTo: 'problem-high', payload: { method: 'independent-replay' } });
  await syncytium.reportUnresolvedDependency(board.sessionId, {
    opId: 'board-dependency-op', eventId: 'dependency-1', actorId: 'builder',
    payload: { package: 'parser-core', reason: 'missing compatibility contract' }
  });
  await syncytium.publishBlackboardResult(board.sessionId, {
    opId: 'board-result-op', eventId: 'result-1', actorId: 'fixer', respondsTo: 'problem-1',
    payload: { patch: 'fix-42', status: 'ready-for-review' }
  });

  const all = await syncytium.readBlackboard(board.sessionId);
  assert.equal(all.blackboard.length, 7);
  assert.equal(all.priorityQueue[0].eventId, 'problem-high');
  assert.equal(all.blackboard.find((event) => event.eventId === 'result-1').respondsTo, 'problem-1');
  assert.deepEqual(all.unresolvedQuestions.map((event) => event.eventId).sort(),
    ['dependency-1', 'problem-high', 'verify-1', 'verify-open-1']);
  assert.equal((await syncytium.readBlackboard(board.sessionId, { eventType: 'request_verification' })).blackboard.length, 2);
  assert.equal(all.shared.sharedFields.events.length, 7);

  await assert.rejects(() => syncytium.postProblem(board.sessionId, {
    opId: 'bad-blackboard-op', actorId: 'agent', payload: 'not structured'
  }), (error) => error.code === 'SYNCYTIUM_BLACKBOARD_EVENT_INVALID');
  await assert.rejects(() => syncytium.readBlackboard(board.sessionId, { eventType: 'unknown' }),
    (error) => error.code === 'SYNCYTIUM_BLACKBOARD_EVENT_INVALID');

  const expiringBoard = await syncytium.createBlackboardSession('Retain expired events in append-only history.');
  await syncytium.postProblem(expiringBoard.sessionId, { opId: 'expiring-op', eventId: 'expiring-event',
    actorId: 'coordinator', createdAt: 1000, ttlMs: 10, payload: { title: 'Temporary issue' } });
  assert.equal((await syncytium.readBlackboard(expiringBoard.sessionId, { now: 1009 })).blackboard.length, 1);
  const expired = await syncytium.readBlackboard(expiringBoard.sessionId, { now: 1010 });
  assert.equal(expired.blackboard.length, 0);
  assert.equal(expired.shared.sharedFields.events.length, 1);
}

main().then(() => console.log('Syncytium blackboard variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
