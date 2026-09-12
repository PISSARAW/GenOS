/**
 * Recovery dispatch: provisions a recovery agent (identity, workspace, lineage)
 * and starts its mission. Lineage persistence is atomic with the agent row so a
 * worker can never be created without lineage.
 */
const path = require('path');
const crypto = require('crypto');
const workerRecovery = require('../workerFailureRecoveryService');
const workerGarage = require('../workerGarageService');
const bisectionService = require('../bisectionService');
const {
  pendingWorkerRecoveries, activeWorkerRecoveryDispatches, pendingContinuations,
  activeWorkerBarriers, emit, updateAgent, workerToolLease
} = require('../agentOrchestrationState');
const { createIsolatedWorkspace, cleanupWorkspace } = require('../agentWorkspaceLifecycleService');
const agentEvolution = require('../agentEvolutionService');
const { getDatabase, withTransaction } = require('../../db');
const { MAX_RECOVERY_DISPATCH_ATTEMPTS } = require('./constants');

function firstTruthy(...values) {
  for (const value of values) if (value) return value;
  return values[values.length - 1];
}

function bestEffort(promise) {
  return promise.catch(() => {});
}

function nullOnError(promise) {
  return promise.catch(() => { return null; });
}

function hasRecoveryParent(source) {
  return Boolean(source && source.parent_agent_id);
}

function isCancelled(barrier) {
  return Boolean(barrier && barrier.cancelled);
}

function addWorkerToBarrier(barrier, workerId) {
  if (barrier && barrier.workerIds) barrier.workerIds.add(workerId);
}

function garageCapacity(garage) {
  if (garage && garage.capacity) return garage.capacity;
  return workerGarage.MAX_ACTIVE_WORKERS;
}

async function loadSourceWorker(db, sourceAgentId) {
  return db.get(
    `SELECT a.id, a.name, a.role, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier, a.language,
      a.isolation_mode, a.parent_agent_id
     , w.path AS workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = ? AND a.execution_mode = 'worker'`,
    sourceAgentId
  );
}

function emitRecoveryUnavailable(sourceAgentId, source, recovery) {
  const { report, decision } = recovery;
  emit(sourceAgentId, 'WORKER_RECOVERY_UNAVAILABLE', 'RECOVERY_DEAD_LETTER', 'Recovery could not be dispatched because the source worker no longer has a valid persisted parent or workspace.', {
    sourceWorkerId: sourceAgentId,
    recoveryAction: decision.action,
    attempt: report.attempt + 1,
    maxAttempts: report.maxAttempts,
    sourceExists: Boolean(source)
  }, 'error');
}

function shouldRunBisection(decision, report, mission) {
  const regression = decision.action === 'bisect_and_rollback' || ['test_failure', 'regression'].includes(report.category);
  const hasSnapshots = mission.snapshots && mission.snapshots.length >= 2;
  return regression || hasSnapshots;
}

async function runAutomaticBisection(db, source, data) {
  const { mission, report, decision, orchestratorId, sourceAgentId } = data;
  if (!shouldRunBisection(decision, report, mission)) return null;
  try {
    const result = await bisectionService.autoBisectWorkspaceAnomaly(db, {
      workspaceId: source.workspace_id || mission.workspaceId,
      workspaceRoot: mission.workspaceRoot,
      testCommand: mission.testCommand || 'npm test',
      snapshotHistory: mission.snapshots
    });
    if (result?.anomalyFound && result.culpritReport) {
      report.bisection = result;
      report.culpritReport = result.culpritReport;
      emit(orchestratorId, 'WORKER_CAUSAL_BISECTION_COMPLETED', 'BISECTION',
        `Bisection causale O(log N) réussie : pas fautif #${result.culpritReport.stepNumber} isolé en ${result.bisectionIterationsRequired} itérations.`,
        { sourceWorkerId: sourceAgentId, culpritReport: result.culpritReport, bisectionResult: result }, 'info');
    }
    return result;
  } catch (bisectionError) {
    emit(orchestratorId, 'WORKER_CAUSAL_BISECTION_FAILED', 'BISECTION_ERROR',
      `Échec de la bisection causale : ${bisectionError.message}`,
      { sourceWorkerId: sourceAgentId, error: bisectionError.message }, 'warning');
    return null;
  }
}

function resolveRecoveryTarget(input) {
  const { sourceAgentId, source, recovery, orchestratorId } = input;
  const { mission, report, decision } = recovery;
  const sameIdentity = decision.identity === 'same';
  const targetId = sameIdentity
    ? sourceAgentId
    : `worker_${orchestratorId}_recovery_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const role = firstTruthy(decision.role, source.role, mission.role, 'recovery_specialist');
  const prompt = workerRecovery.recoveryPrompt(report, decision);
  const name = workerGarage.workerName({ role, mission: `${decision.action}: ${report.mission}` });
  return { sameIdentity, targetId, role, prompt, name, sourceAgentId, orchestratorId, mission, report, decision };
}

function buildRecoveryAgentValues(source, target) {
  return [
    target.targetId,
    target.name,
    firstTruthy(source.name_meaning, `Recovery identity of ${firstTruthy(source.name, target.sourceAgentId, target.targetId)}`),
    target.role,
    'idle',
    firstTruthy(source.agent_type, 'GenOS'),
    'worker',
    firstTruthy(source.workspace_id, null),
    firstTruthy(source.fleet_id, null),
    firstTruthy(source.model_tier, target.mission.modelTier, 'standard'),
    firstTruthy(source.language, 'TypeScript'),
    firstTruthy(source.isolation_mode, 'Branch'),
    target.orchestratorId,
    target.decision.action,
    `Recovery scope: ${target.report.mission}`,
    target.prompt
  ];
}

async function insertRecoveryAgent(db, source, target) {
  await db.run(
    `INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id,
      model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ...buildRecoveryAgentValues(source, target)
  );
}

async function ensureLineageNode(db, source, nodeId) {
  await db.run(
    `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary)
     VALUES (?, ?, ?, ?, 'agent', ?)
     ON CONFLICT(id) DO NOTHING`,
    nodeId,
    source.workspace_id,
    nodeId,
    source.name || nodeId,
    `Recovery source: ${source.role || 'worker'}`
  );
}

async function recordRecoveryLineage(db, source, target) {
  const lineage = await agentEvolution.recordWorkerLineage(db, {
    agentId: target.targetId,
    name: target.name,
    role: target.role,
    workspaceId: source.workspace_id
  }, {
    parentId: target.orchestratorId,
    edgeType: 'recovery'
  });
  if (!lineage?.success) {
    throw Object.assign(new Error(lineage?.error || 'Failed to persist recovery worker lineage.'), { code: 'LINEAGE_PERSISTENCE_FAILED' });
  }
  if (target.sourceAgentId && target.sourceAgentId !== target.targetId) {
    await ensureLineageNode(db, source, target.sourceAgentId);
    await db.run(
      `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type)
       VALUES (?, ?, ?, ?, 'recovery_transition')
       ON CONFLICT(id) DO NOTHING`,
      `edge_recovery_${target.sourceAgentId}_${target.targetId}`,
      source.workspace_id,
      target.sourceAgentId,
      target.targetId
    );
  }
}

async function persistRecoveryAgent(db, source, target) {
  if (target.sameIdentity) {
    await db.run("UPDATE agents SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = ?", target.targetId);
    return;
  }
  await withTransaction(db, async () => {
    await insertRecoveryAgent(db, source, target);
    if (source.workspace_id) await recordRecoveryLineage(db, source, target);
  });
}

async function createRecoveryWorkspace(source, mission, target) {
  const sourceRoot = firstTruthy(source.workspace_root, mission.workspaceRoot, process.env.GENOS_WORKSPACE_ROOT, path.resolve(__dirname, '../../../..'));
  const capsuleName = `${target.targetId}_${target.decision.action}_${target.report.attempt + 1}`;
  const workspaceRoot = await createIsolatedWorkspace(sourceRoot, capsuleName, mission.capsuleRoot);
  return { workspaceRoot, capsuleName };
}

function emitRecoveryDispatch(orchestratorId, target, meta) {
  const { sourceAgentId, report, decision, garage, mission } = meta;
  const previousVariant = Number(mission.variantIndex || 0);
  const nextVariant = previousVariant + 1;
  emit(orchestratorId, 'COGNITIVE_MOLTING_TRIGGERED', 'MUE_COGNITIVE', `Mue cognitive déclenchée : passage au variant de modèle index ${previousVariant} -> ${nextVariant}.`, {
    sourceWorkerId: sourceAgentId, workerId: target.targetId, attempt: report.attempt + 1, previousVariant, nextVariant
  }, 'info');
  emit(orchestratorId, 'WORKER_RECOVERY_DISPATCHED', decision.action, `Dispatched ${decision.action} as '${target.name}'.`, {
    sourceWorkerId: sourceAgentId, workerId: target.targetId, attempt: report.attempt + 1,
    slot: garage.slot, capacity: garage.capacity, decision
  }, 'info');
  return nextVariant;
}

async function emitSlotReleased(db, worker, message) {
  const garage = await nullOnError(workerGarage.state(db, worker.orchId));
  emit(worker.orchId, 'WORKER_SLOT_RELEASED', 'GARAGE', message.detail, {
    workerId: worker.targetId,
    capacity: garageCapacity(garage),
    occupied: garage ? garage.occupied : undefined,
    available: garage ? garage.available : undefined
  }, message.severity);
}

async function cancelRecoveryDispatch(db, target, workspace) {
  if (workspace.workspaceRoot) await bestEffort(cleanupWorkspace(workspace.workspaceRoot, workspace.capsuleName || target.targetId));
  await updateAgent(target.targetId, 'blocked', 'Recovery stopped with the orchestrator evidence barrier');
  await emitSlotReleased(db, { targetId: target.targetId, orchId: target.orchestratorId, workerName: target.name }, {
    detail: `Worker '${target.name}' released its active slot due to recovery barrier cancellation.`,
    severity: 'info'
  });
}

function buildRecoveryMission(input) {
  const { mission, sourceAgentId, target, workspace, bisectionResult, report, orchestratorId, decision, nextVariant } = input;
  return {
    ...mission,
    agentId: target.targetId,
    name: target.name,
    role: target.role,
    prompt: target.prompt,
    variantIndex: nextVariant,
    originalMission: report.mission,
    recoveryAttempt: report.attempt + 1,
    recoveryMaxAttempts: report.maxAttempts,
    recoveryHistory: [...(mission.recoveryHistory || []), { workerId: sourceAgentId, category: report.category, action: decision.action, report, decision }],
    bisection: bisectionResult || report.bisection || null,
    culpritReport: report.culpritReport || null,
    workspaceRoot: workspace.workspaceRoot,
    workspaceProvisioned: true,
    orchestratorAgentId: orchestratorId,
    budgetRound: undefined,
    localModel: decision.action === 'replace_worker' ? undefined : mission.localModel,
    localRoutingPolicy: decision.action === 'replace_worker' ? undefined : mission.localRoutingPolicy,
    disableLocalModel: decision.action === 'replace_worker',
    toolLease: workerToolLease(target.role),
    autonomousOrchestration: false
  };
}

function resolveFailureTarget(target, sourceAgentId, fallbackOrchestratorId) {
  if (!target) return { targetId: sourceAgentId, orchId: fallbackOrchestratorId, workerName: sourceAgentId };
  return { targetId: target.targetId, orchId: target.orchestratorId, workerName: target.name };
}

async function handleRecoveryDispatchFailure(db, error, data) {
  const { recovery, sourceAgentId, report, decision, recoveryBarrier, workspace, target, orchestratorId } = data;
  const worker = resolveFailureTarget(target, sourceAgentId, orchestratorId);
  if (workspace.workspaceRoot) await bestEffort(cleanupWorkspace(workspace.workspaceRoot, workspace.capsuleName || worker.targetId));
  await bestEffort(db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, worker.targetId));
  const dispatchAttempts = Number(recovery.dispatchAttempts || 0) + 1;
  emit(worker.orchId, 'WORKER_RECOVERY_DISPATCH_FAILED', decision.action, error.message, {
    sourceWorkerId: sourceAgentId, workerId: worker.targetId, attempt: report.attempt + 1, dispatchAttempts
  }, 'error');
  await emitSlotReleased(db, worker, {
    detail: `Worker '${worker.workerName}' released its active slot due to recovery failure.`,
    severity: 'warning'
  });
  if (dispatchAttempts < MAX_RECOVERY_DISPATCH_ATTEMPTS && !isCancelled(recoveryBarrier)) {
    pendingWorkerRecoveries.set(sourceAgentId, { ...recovery, dispatchAttempts });
    setTimeout(() => { dispatchWorkerRecovery(sourceAgentId); }, 50 * (2 ** (dispatchAttempts - 1))).unref();
  }
}

async function dispatchWorkerRecovery(sourceAgentId) {
  const { startMission } = require('../agentRuntimeAdapter');
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
    source = await loadSourceWorker(db, sourceAgentId);
  } catch (error) {
    activeWorkerRecoveryDispatches.delete(sourceAgentId);
    throw error;
  }
  if (!hasRecoveryParent(source)) {
    emitRecoveryUnavailable(sourceAgentId, source, recovery);
    activeWorkerRecoveryDispatches.delete(sourceAgentId);
    return false;
  }
  const orchestratorId = source.parent_agent_id;
  const recoveryBarrier = activeWorkerBarriers.get(orchestratorId);
  if (isCancelled(recoveryBarrier)) {
    activeWorkerRecoveryDispatches.delete(sourceAgentId);
    return false;
  }
  let workspace = { workspaceRoot: null, capsuleName: null };
  let target = null;
  try {
    const bisectionResult = await runAutomaticBisection(db, source, { mission, report, decision, orchestratorId, sourceAgentId });
    target = resolveRecoveryTarget({ sourceAgentId, source, recovery, orchestratorId });
    addWorkerToBarrier(recoveryBarrier, target.targetId);
    await persistRecoveryAgent(db, source, target);
    const garage = await workerGarage.reserveSlot(db, { orchestratorId, workerId: target.targetId, name: target.name, role: target.role, mission: target.prompt });
    workspace = await createRecoveryWorkspace(source, mission, target);
    const nextVariant = emitRecoveryDispatch(orchestratorId, target, { sourceAgentId, report, decision, garage, mission });
    if (isCancelled(recoveryBarrier)) {
      await cancelRecoveryDispatch(db, target, workspace);
      return false;
    }
    await startMission(buildRecoveryMission({ mission, sourceAgentId, target, workspace, bisectionResult, report, orchestratorId, decision, nextVariant }));
    return true;
  } catch (error) {
    await handleRecoveryDispatchFailure(db, error, { recovery, sourceAgentId, report, decision, recoveryBarrier, workspace, target, orchestratorId });
    return false;
  } finally {
    activeWorkerRecoveryDispatches.delete(sourceAgentId);
  }
}

module.exports = { dispatchWorkerRecovery, MAX_RECOVERY_DISPATCH_ATTEMPTS };
