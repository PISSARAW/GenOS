/**
 * Worker failure recovery: failure reports, recovery decisions (retry, mutate,
 * fork, replace), and the dispatch of recovery missions.
 */
const path = require('path');
const workerRecovery = require('./workerFailureRecoveryService');
const dynamicOrganization = require('./dynamicOrganizationService');
const workerGarage = require('./workerGarageService');
const {
  pendingWorkerRecoveries, activeWorkerRecoveryDispatches, pendingContinuations,
  activeWorkerBarriers, emit, updateAgent
} = require('./agentOrchestrationState');
const { createIsolatedWorkspace } = require('./agentWorkspaceLifecycleService');

async function applyOrganizationDecision(orchestratorId, organization, reason) {
  if (!orchestratorId || !dynamicOrganization.organizationProfile(organization)) return null;
  const db = await getDatabase();
  const transition = await dynamicOrganization.changeOrganization(db, {
    orchestratorId, organization, reason, changedBy: orchestratorId
  });
  if (transition.changed) {
    emit(orchestratorId, 'ORGANIZATION_CHANGED', 'REORGANIZE', `Changed organization from '${transition.previous || 'none'}' to '${transition.organization}'.`, transition, 'info');
  }
  return transition;
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
  emit(orchestratorId, 'WORKER_FAILURE_REPORTED', 'ANALYZE_FAILURE', `Worker '${report.workerId}' reported that it could not complete its mission.`, { report }, 'warning');
  emit(orchestratorId, 'WORKER_RECOVERY_DECISION', decision.action, decision.reason, {
    workerId: report.workerId, report, decision
  }, decision.terminal && decision.action !== 'conclude_no_answer' ? 'warning' : 'info');
  const recoveryOrganization = decision.action === 'mutate_worker'
    ? 'isolated_recovery'
    : decision.action === 'fork_worker' ? 'competitive_arena'
      : decision.action === 'replace_worker' ? 'specialist_expert_committee' : null;
  if (recoveryOrganization) applyOrganizationDecision(orchestratorId, recoveryOrganization, decision.reason).catch(() => {});
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
async function dispatchWorkerRecovery(sourceAgentId) {
  const { startMission } = require('./agentRuntimeAdapter');
  if (activeWorkerRecoveryDispatches.has(sourceAgentId)) return false;
  const recovery = pendingWorkerRecoveries.get(sourceAgentId);
  if (!recovery) return false;
  activeWorkerRecoveryDispatches.add(sourceAgentId);
  pendingWorkerRecoveries.delete(sourceAgentId);
  pendingContinuations.delete(sourceAgentId);
  const { mission, report, decision } = recovery;
  let db;
  let source;
  try {
    db = await getDatabase();
    source = await db.get(
      `SELECT id, name, role, agent_type, workspace_id, fleet_id, model_tier, language,
              isolation_mode, parent_agent_id
       FROM agents WHERE id = ? AND execution_mode = 'worker'`,
      sourceAgentId
    );
  } catch (error) {
    activeWorkerRecoveryDispatches.delete(sourceAgentId);
    throw error;
  }
  if (!source?.parent_agent_id) {
    activeWorkerRecoveryDispatches.delete(sourceAgentId);
    return false;
  }
  const orchestratorId = source.parent_agent_id;
  const recoveryBarrier = activeWorkerBarriers.get(orchestratorId);
  if (recoveryBarrier?.cancelled) {
    activeWorkerRecoveryDispatches.delete(sourceAgentId);
    return false;
  }
  const sameIdentity = decision.identity === 'same';
  const targetId = sameIdentity
    ? sourceAgentId
    : `worker_${orchestratorId}_recovery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  recoveryBarrier?.workerIds.add(targetId);
  const role = decision.role || source.role || mission.role || 'recovery_specialist';
  const prompt = workerRecovery.recoveryPrompt(report, decision);
  const name = workerGarage.workerName({ role, mission: `${decision.action}: ${report.mission}` });
  let workspaceRoot;
  try {
    await workerGarage.requireAvailableSlot(db, orchestratorId);
    const sourceRoot = mission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
    workspaceRoot = await createIsolatedWorkspace(
      sourceRoot,
      `${targetId}_${decision.action}_${report.attempt + 1}`,
      path.dirname(sourceRoot)
    );
    if (sameIdentity) {
      await db.run("UPDATE agents SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = ?", targetId);
    } else {
      await db.run(
        `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id,
          model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task)
         VALUES (?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        targetId, name, role, source.agent_type || 'GenOS', source.workspace_id || null, source.fleet_id || null,
        source.model_tier || mission.modelTier || 'standard', source.language || 'TypeScript', source.isolation_mode || 'Branch',
        orchestratorId, decision.action, `Recovery scope: ${report.mission}`, prompt
      );
    }
    const garage = await workerGarage.reserveSlot(db, { orchestratorId, workerId: targetId, name, role, mission: prompt });
    emit(orchestratorId, 'WORKER_RECOVERY_DISPATCHED', decision.action, `Dispatched ${decision.action} as '${name}'.`, {
      sourceWorkerId: sourceAgentId, workerId: targetId, attempt: report.attempt + 1,
      slot: garage.slot, capacity: garage.capacity, decision
    }, 'info');
    if (recoveryBarrier?.cancelled) {
      await updateAgent(targetId, 'blocked', 'Recovery stopped with the orchestrator evidence barrier');
      activeWorkerRecoveryDispatches.delete(sourceAgentId);
      return false;
    }
    await startMission({
      ...mission,
      agentId: targetId,
      name,
      role,
      prompt,
      originalMission: report.mission,
      recoveryAttempt: report.attempt + 1,
      recoveryMaxAttempts: report.maxAttempts,
      recoveryHistory: [...(mission.recoveryHistory || []), { workerId: sourceAgentId, report, decision }],
      workspaceRoot,
      workspaceProvisioned: true,
      orchestratorAgentId: orchestratorId,
      budgetRound: undefined,
      localModel: decision.action === 'replace_worker' ? undefined : mission.localModel,
      localRoutingPolicy: decision.action === 'replace_worker' ? undefined : mission.localRoutingPolicy,
      disableLocalModel: decision.action === 'replace_worker',
      toolLease: workerToolLease(role),
      autonomousOrchestration: false
    });
    activeWorkerRecoveryDispatches.delete(sourceAgentId);
    return true;
  } catch (error) {
    await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, targetId).catch(() => {});
    emit(orchestratorId, 'WORKER_RECOVERY_DISPATCH_FAILED', decision.action, error.message, {
      sourceWorkerId: sourceAgentId, workerId: targetId, attempt: report.attempt + 1
    }, 'error');
    activeWorkerRecoveryDispatches.delete(sourceAgentId);
    return false;
  }
}

module.exports = { applyOrganizationDecision, queueWorkerRecovery, dispatchWorkerRecovery };
