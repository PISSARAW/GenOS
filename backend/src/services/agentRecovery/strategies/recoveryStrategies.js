const { applyOrganizationDecision } = require('./agentRecoveryService');
const { pendingWorkerRecoveries, emit } = require('./agentOrchestrationState');
const workerRecovery = require('./workerFailureRecoveryService');

function getRecoveryOrganization(action) {
  if (action === 'mutate_worker') return 'isolated_recovery';
  if (action === 'fork_worker') return 'competitive_arena';
  if (action === 'bisect_and_rollback') return 'isolated_recovery';
  if (action === 'replace_worker') return 'specialist_expert_committee';
  return null;
}

function handleRecoveryCycle(..._args) {
  const [report, decision, orchestratorId, workerId, recoveryHistory] = _args;

  const cycleDecision = {
    action: 'escalate_recovery_cycle', terminal: true, retry: false,
    reason: `Recovery cycle detected: '${decision.action}' already failed for category '${report.category}'.`
  };
  emit(orchestratorId, 'WORKER_RECOVERY_CYCLE_DETECTED', cycleDecision.action, cycleDecision.reason, { workerId, report, recoveryHistory }, 'error');
  return { report, decision: cycleDecision, queued: false, cycleDetected: true };
}

function handleRecoveryDecision(report, decision, orchestratorId) {
  emit(orchestratorId, 'WORKER_FAILURE_REPORTED', 'ANALYZE_FAILURE', `Worker '${report.workerId}' reported that it could not complete its mission.`, { report }, 'warning');
  emit(orchestratorId, 'WORKER_RECOVERY_DECISION', decision.action, decision.reason, { workerId: report.workerId, report, decision }, decision.terminal && decision.action !== 'conclude_no_answer' ? 'warning' : 'info');
  const recoveryOrganization = getRecoveryOrganization(decision.action);
  if (recoveryOrganization) applyOrganizationDecision(orchestratorId, recoveryOrganization, decision.reason).catch(() => {});
  if (decision.retry && !pendingWorkerRecoveries.has(report.workerId)) {
    pendingWorkerRecoveries.set(report.workerId, { mission: report.mission, report, decision });
    return { report, decision, queued: true };
  }
  if (decision.action === 'conclude_no_answer') {
    emit(orchestratorId, 'WORKER_NO_ANSWER_ACCEPTED', 'CONCLUDE_NO_ANSWER', 'The orchestrator accepted the worker proof that no answer exists in the stated scope.', { workerId: report.workerId, proof: report.noAnswerProof }, 'info');
  } else if (decision.action === 'escalate_unresolved') {
    emit(orchestratorId, 'WORKER_RECOVERY_EXHAUSTED', 'ESCALATE', decision.reason, { workerId: report.workerId, report }, 'warning');
  }
  return { report, decision, queued: false };
}

function queueWorkerRecovery(mission, event) {
  const workerId = mission.agentId || mission.id;
  if (pendingWorkerRecoveries.has(workerId)) {
    const pending = pendingWorkerRecoveries.get(workerId);
    return { report: pending.report, decision: pending.decision, queued: false, duplicate: true };
  }
  const report = workerRecovery.failureReport(event, mission);
  const decision = workerRecovery.decideRecovery(report);
  const orchestratorId = mission.orchestratorAgentId;
  if (!orchestratorId) return { report, decision, queued: false };
  const recoveryHistory = Array.isArray(mission.recoveryHistory) ? mission.recoveryHistory : [];
  const repeatedStrategy = recoveryHistory.some((entry) => entry.category === report.category && entry.action === decision.action);
  if (repeatedStrategy) return handleRecoveryCycle(report, decision, orchestratorId, workerId, recoveryHistory);
  return handleRecoveryDecision(report, decision, orchestratorId);
}

module.exports = { queueWorkerRecovery };
