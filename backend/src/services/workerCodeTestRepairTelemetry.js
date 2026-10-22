'use strict';

const strategyExecution = require('./strategyExecutionService');
const { emit } = require('./agentOrchestrationState');

async function publish(context) {
  const event = emit(context.mission.agentId, 'LOCAL_CODE_TEST_REPAIR', 'TEST_FEEDBACK',
    `Retrying after test failure ${context.failedAttempt}; ${context.remainingMs} ms remain.`, {
      failedAttempt: context.failedAttempt,
      remainingMs: context.remainingMs,
      proposalTests: context.error.proposal?.tests
    }, 'warning', 'running');
  await strategyExecution.recordExecutionEvent(context.db, context.mission.agentId, event);
}

module.exports = { publish };
