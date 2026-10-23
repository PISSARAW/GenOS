'use strict';

const { emit } = require('./agentOrchestrationState');
const execution = require('./strategyExecutionService');

async function prepare(input) {
  const { db, mission, executionRun, evidenceReport } = input;
  const codeProposal = Boolean(mission.workerContract?.mission?.codeVerificationContract);
  const observation = emit(mission.agentId, 'EVIDENCE_REPORT', codeProposal ? 'LOCAL_CODE_PROPOSAL' : 'LOCAL_REVIEW',
    codeProposal ? 'Local code proposal and passing tests persisted before independent verification.'
      : 'Local worker evidence persisted before independent verification.',
    { executionRunId: executionRun.id, evidenceReport }, 'info', 'running');
  const progress = await execution.recordExecutionEvent(db, mission.agentId, observation);
  if (progress?.halt) throw Object.assign(new Error(progress.reason), { code: 'WORKER_EXECUTION_HALTED' });
  return require('./epistemic/nativeOracleCoordinator').prepare(db, {
    agentId: mission.agentId, runId: executionRun.id
  });
}

module.exports = { prepare };
