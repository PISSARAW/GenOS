'use strict';

const { emit, updateAgent } = require('../agentOrchestrationState');
const { recordExecutionEvent } = require('../strategyExecutionService');
const { recordWorkerEvidence } = require('../agentEvidenceService');
const { validateWorkerArtifact } = require('./workerArtifactContract');
const { assertRuntimeContract, assertAssignmentMatches } = require('./workerContractEnforcement');
const { executeNativeWorker } = require('./workerExecutorRegistry');
const { reportFor } = require('./workerDeterministicReports');
const { assertActive, executionContext } = require('./workerNativeLifecycle');
const { error } = require('./workerNativeEvidence');

async function publish(db, mission, event) {
  const progress = await recordExecutionEvent(db, mission.agentId, event);
  const failureEvent = ['AGENT_FAILED', 'AGENT_HALTED'].includes(event.eventType);
  if (progress?.halt && !failureEvent) {
    const failure = error('WORKER_EXECUTION_HALTED', progress.reason || 'Execution guard halted the native worker.');
    failure.terminalReceiptPublished = Boolean(progress.biologicalReceipt);
    throw failure;
  }
  recordWorkerEvidence(mission, event);
}

async function complete(context, executionRun, result) {
  const { db, mission } = context;
  assertActive(context);
  const evidenceReport = reportFor(mission.workerKind, result);
  validateWorkerArtifact({ events: [{ evidenceReport }] }, mission);
  const evidence = emit(mission.agentId, 'EVIDENCE_REPORT', mission.workerKind, 'Native worker evidence validated.', {
    executionRunId: executionRun.id, evidenceReport
  }, 'info', 'running');
  await publish(db, mission, evidence);
  assertActive(context);
  const completed = emit(mission.agentId, 'AGENT_COMPLETED', mission.workerKind, 'Native worker completed.', {
    executionRunId: executionRun.id, evidenceReport,
    usage: { input_tokens: 0, output_tokens: 0, tokens: 0, cost_usd: 0 }
  }, 'info', 'completed');
  await publish(db, mission, completed);
  await updateAgent(mission.agentId, 'completed', 'Native result validated');
  return { started: true, executionRun, deterministic: true, result };
}

async function fail(context, executionRun, failure) {
  const { db, mission } = context;
  const cancelled = failure.code === 'MISSION_CANCELLED';
  const status = cancelled ? 'terminated' : 'error';
  await updateAgent(mission.agentId, status, failure.message);
  const failed = emit(mission.agentId, cancelled ? 'AGENT_HALTED' : 'AGENT_FAILED', mission.workerKind, failure.message, {
    executionRunId: executionRun.id,
    failure: { category: 'deterministic_execution', reason: failure.message, code: failure.code }
  }, 'warning', status);
  if (failure.terminalReceiptPublished) recordWorkerEvidence(mission, failed);
  else await publish(db, mission, failed);
  return { started: false, executionRun, deterministic: true, error: failure.message, code: failure.code };
}

async function runDeterministicWorker(db, mission, executionRun) {
  const context = executionContext(db, mission);
  const method = mission.methodContract || mission.workerContract?.mission?.methodContract;
  try {
    await require('../missionEnvelopeAuthority').assertRun(db, { agentId: mission.agentId, runId: executionRun.id, mission });
    assertActive(context);
    assertRuntimeContract(mission.workerContract, mission.workerKind);
    assertAssignmentMatches(mission.workerContract, { ...mission, methodContract: method });
    await updateAgent(mission.agentId, 'running', mission.prompt);
    const started = emit(mission.agentId, 'DETERMINISTIC_WORKER_STARTED', mission.workerKind, 'Native worker started.', {
      executionRunId: executionRun.id, methodId: method?.methodId
    }, 'info', 'running');
    await publish(db, mission, started);
    assertActive(context);
    const result = await executeNativeWorker(mission.workerKind, method, context);
    return await complete(context, executionRun, result);
  } catch (failure) {
    return fail(context, executionRun, failure);
  }
}

module.exports = { reportFor, runDeterministicWorker };
