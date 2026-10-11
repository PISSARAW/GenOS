'use strict';

const observerService = require('../continuousExecution/observer');
const policy = require('../continuousExecution/policy');
const { emit } = require('../agentOrchestrationState');
const { recordExecutionEvent } = require('../strategyExecutionService');
const { recordWorkerEvidence } = require('../agentEvidenceService');
const { error } = require('./workerNativeEvidence');

async function publish(context, type, payload) {
  const { db, mission, executionRun } = context;
  const event = emit(mission.agentId, type, 'filesystem', 'Declared dependency changed.', {
    executionRunId: executionRun.id, ...payload
  }, 'info', 'running');
  const progress = await recordExecutionEvent(db, mission.agentId, event);
  if (progress?.halt) throw error('WORKER_EXECUTION_HALTED', progress.reason || 'Observation guard halted the native worker.');
  recordWorkerEvidence(mission, event);
}

function reportChange(context, change) {
  const observer = context.observer;
  for (const receipt of change.observations) {
    context.pending.push(publish(context, 'PERCEPTION_OBSERVED', { observation: receipt }));
  }
  context.pending.push(publish(context, 'CONTINUOUS_OBSERVATION', {
    planRevision: observer.state.planRevision, mode: observer.state.mode,
    reason: change.reason, observations: change.observations
  }));
}

async function run(context, execute) {
  const { mission, executionRun, db } = context;
  const config = policy.normalize(mission.continuousExecution);
  if (config.mode === 'off') return execute();
  if (!config.observationWindowMs) {
    throw error('INVALID_CONTINUOUS_NATIVE_WINDOW', 'Native continuous observation requires observationWindowMs.');
  }
  const observer = await observerService.create({
    db, agentId: mission.agentId, runId: executionRun.id,
    workspaceRoot: mission.workspaceRoot, options: mission.continuousExecution
  });
  const session = { ...context, observer, pending: [] };
  observerService.start(observer, (change) => reportChange(session, change));
  let result;
  try {
    await new Promise((resolve) => setTimeout(resolve, config.observationWindowMs));
    result = await execute();
  } finally {
    await observerService.close(observer);
    await Promise.all(session.pending);
  }
  const verdict = policy.verdict(observer.state);
  if (config.mode === 'control' && !verdict.eligible) {
    throw error('WORKER_ENVIRONMENT_CHANGED', `Native result withheld: ${verdict.reason}.`);
  }
  return result;
}

module.exports = { run };
