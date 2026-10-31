/**
 * Recovery queueing: builds a failure report/decision, emits telemetry and
 * stores the mission so a worker slot can later dispatch a recovery agent.
 */
const { pendingWorkerRecoveries, emit } = require('../agentOrchestrationState');
const workerRecovery = require('../workerFailureRecoveryService');
const { applyOrganizationDecision } = require('./organizationDecision');
const handledFailures = new Map();
const durableQueue = require('./durableRecoveryQueue');

function requiresContinuousCoordination(mission = {}) {
  const policy = mission.coordinationPolicy || mission.coordination_policy || {};
  const cadence = policy.communicationCadence || policy.communication_cadence;
  return mission.communicationRequired === true || mission.organization === 'cross_functional_pod'
    || String(cadence || '').toLowerCase() === 'continuous_sync';
}

function getRecoveryOrganization(action, mission = {}) {
  if (requiresContinuousCoordination(mission)) return null;
  if (action === 'mutate_worker') return 'isolated_recovery';
  if (action === 'fork_worker') return 'competitive_arena';
  if (action === 'bisect_and_rollback') return 'isolated_recovery';
  if (action === 'replace_worker') return 'specialist_expert_committee';
  return null;
}

function handleRecoveryCycle(report, decision, context) {
  const { orchestratorId, workerId, recoveryHistory } = context;
  const cycleDecision = {
    action: 'escalate_recovery_cycle', terminal: true, retry: false,
    reason: `Recovery cycle detected: '${decision.action}' already failed for category '${report.category}'.`
  };
  emit(orchestratorId, 'WORKER_RECOVERY_CYCLE_DETECTED', cycleDecision.action, cycleDecision.reason, { workerId, report, recoveryHistory }, 'error');
  return { report, decision: cycleDecision, queued: false, cycleDetected: true };
}

function handleRecoveryDecision(report, decision, context) {
  const { orchestratorId, mission } = context;
  emit(orchestratorId, 'WORKER_FAILURE_REPORTED', 'ANALYZE_FAILURE', `Worker '${report.workerId}' reported that it could not complete its mission.`, { report }, 'warning');
  emit(orchestratorId, 'WORKER_RECOVERY_DECISION', decision.action, decision.reason, {
    workerId: report.workerId, report, decision
  }, decision.terminal && decision.action !== 'conclude_no_answer' ? 'warning' : 'info');
  const recoveryOrganization = getRecoveryOrganization(decision.action, mission);
  if (recoveryOrganization) {
    applyOrganizationDecision(orchestratorId, recoveryOrganization, decision.reason).catch((err) => {
      console.error('[WorkerRecovery] Failed to apply organization decision.', {
        orchestratorId, errorCode: typeof err?.code === 'string' ? err.code : 'UNKNOWN'
      });
    });
  }
  if (decision.retry && !pendingWorkerRecoveries.has(report.workerId)) {
    pendingWorkerRecoveries.set(report.workerId, { mission, report, decision });
    return { report, decision, queued: true };
  }
  if (decision.action === 'conclude_no_answer') {
    emit(orchestratorId, 'WORKER_NO_ANSWER_ACCEPTED', 'CONCLUDE_NO_ANSWER', 'The orchestrator accepted the worker proof that no answer exists in the stated scope.', {
      workerId: report.workerId, proof: report.noAnswerProof
    }, 'info');
  } else if (decision.action === 'escalate_unresolved') {
    emit(orchestratorId, 'WORKER_RECOVERY_EXHAUSTED', 'ESCALATE', decision.reason, { workerId: report.workerId, report }, 'warning');
  }
  return { report, decision, queued: false };
}

async function refreshPendingRecovery(pending, mission, event) {
  const workerId = mission.agentId || mission.id;
  const report = workerRecovery.failureReport(event, mission);
  const decision = workerRecovery.decideRecovery(report);
  if (Number(report.attempt || 0) > Number(pending.report?.attempt || 0) && decision.retry) {
    await durableQueue.enqueue({ workerId, mission, report, decision,
      key: JSON.stringify([mission.missionId || mission.id, workerId, report.attempt, report.category]) });
    pendingWorkerRecoveries.set(workerId, { mission, report, decision, dispatchAttempts: pending.dispatchAttempts || 0 });
    return { report, decision, queued: true, refreshed: true };
  }
  return { report: pending.report, decision: pending.decision, queued: false, duplicate: true };
}

async function persistQueuedOutcome(outcome, context) {
  const { workerId, mission, report, decision, failureKey } = context;
  if (outcome.queued) {
    try {
      await durableQueue.enqueue({ workerId, mission, report, decision, key: failureKey });
    } catch (err) {
      handledFailures.delete(failureKey);
      pendingWorkerRecoveries.delete(workerId);
      throw err;
    }
  }
  return outcome;
}

async function queueWorkerRecovery(mission, event) {
  const workerId = mission.agentId || mission.id;
  const pending = pendingWorkerRecoveries.get(workerId);
  if (pending) {
    return refreshPendingRecovery(pending, mission, event);
  }
  const report = workerRecovery.failureReport(event, mission);
  const decision = workerRecovery.decideRecovery(report);
  const orchestratorId = mission.orchestratorAgentId;
  if (!orchestratorId) return { report, decision, queued: false };
  const failureKey = JSON.stringify([mission.missionId || mission.id, workerId,
    report.attempt, report.category]);
  if (handledFailures.has(failureKey)) {
    return { report, decision: handledFailures.get(failureKey), queued: false, duplicate: true };
  }
  if (handledFailures.size >= 1024) handledFailures.delete(handledFailures.keys().next().value);
  handledFailures.set(failureKey, decision);
  const recoveryHistory = Array.isArray(mission.recoveryHistory) ? mission.recoveryHistory : [];
  const repeatedStrategy = recoveryHistory.some((entry) => entry.category === report.category && entry.action === decision.action);
  if (repeatedStrategy) {
    return handleRecoveryCycle(report, decision, { orchestratorId, workerId, recoveryHistory });
  }
  return persistQueuedOutcome(handleRecoveryDecision(report, decision, { orchestratorId, mission }),
    { workerId, mission, report, decision, failureKey });
}

module.exports = { queueWorkerRecovery, getRecoveryOrganization };
