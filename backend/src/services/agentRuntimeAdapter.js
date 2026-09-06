/**
 * Provider-neutral bridge between Studio deployments and a real GenOS agent runtime.
 * The configured executable receives one framed protobuf mission on stdin and emits framed
 * protobuf events on stdout. Each event is forwarded to the Studio telemetry bus and agent state.
 *
 * Cohesion map (each concern lives in its own service):
 * - agentOrchestrationState: shared mission maps, telemetry/database bridge, tool leases
 * - agentEvidenceService:    worker evidence dossiers and scoring
 * - agentRoundService:       successive-halving rounds and continuations
 * - agentRecoveryService:    worker failure recovery decisions and dispatches
 * - agentFleetService:       autonomous worker fleets and the evidence barrier
 * - agentModelRoutingService: local/frontier model routing
 * - agentWorkspaceLifecycleService: capsule provisioning and worktree reclamation
 * - agentAutonomyPlanService: orchestrator autonomy planning
 * - agentProcessSupervisor:   child process spawn, event wiring, exit outcome
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fsSync = require('fs');
const { getDatabase } = require('../db');
const strategyExecution = require('./strategyExecutionService');
const strategyContracts = require('./strategyContractService');
const agentAuthority = require('./agentAuthorityService');
const agentCapsules = require('./agentCapsuleService');
const userProgress = require('./userProgressService');
const {
  activeProcesses, missionStarts, cancelledStarts, autonomousRounds, activeWorkerBarriers,
  emit, updateAgent, orchestratorToolLease
} = require('./agentOrchestrationState');
const { localWorkerRoute } = require('./agentModelRoutingService');
const { dispatchPendingContinuation } = require('./agentRoundService');
const { dispatchWorkerRecovery } = require('./agentRecoveryService');
const {
  provisionMissionWorkspace, createIsolatedWorkspace
} = require('./agentWorkspaceLifecycleService');
const {
  runLocalWorker, createAutonomousWorkers, runEvidenceBarrier
} = require('./agentFleetService');
const { buildAutonomyPlanForMission } = require('./agentAutonomyPlanService');
const { superviseMission, runtimeExitOutcome } = require('./agentProcessSupervisor');
const { bundledRuntimeEnvironment, configuredExecutable, runtimeAvailability } = require('./agentRuntimeExecutable');
const { terminateChild, terminatePid, processMatches } = require('./processTermination');

async function startMissionInternal(mission) {
  const agentId = mission.agentId || mission.id;
  const assertNotCancelled = () => {
    if (cancelledStarts.has(agentId)) {
      const error = new Error(`Mission '${agentId}' was stopped before its runtime started.`);
      error.code = 'MISSION_CANCELLED';
      throw error;
    }
  };
  assertNotCancelled();
  const normalizedMission = { ...mission, agentId };
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = normalizedMission.strategyContract || {};
  const executable = configuredExecutable(normalizedMission);
  const db = await getDatabase();
  assertNotCancelled();
  const dispatchedAgent = await agentAuthority.authorizeMission(db, agentId, normalizedMission.orchestratorAgentId, normalizedMission.workspaceId || null);
  normalizedMission.name = normalizedMission.name || dispatchedAgent.name;
  normalizedMission.nameMeaning = normalizedMission.nameMeaning || dispatchedAgent.name_meaning;
  const availability = runtimeAvailability(executable);
  if (!availability.available) throw new Error(availability.reason);
  let contractRecord = await strategyContracts.getLatestContract(db, agentId);
  if (!contractRecord && normalizedMission.orchestratorAgentId) {
    contractRecord = await strategyContracts.getLatestContract(db, normalizedMission.orchestratorAgentId);
  }
  if (!contractRecord) throw new Error(`No strategy contract available for agent ${agentId}`);
  Object.assign(normalizedMission, await provisionMissionWorkspace(normalizedMission, dispatchedAgent.execution_mode));
  assertNotCancelled();
  if (dispatchedAgent.execution_mode === 'worker' && !normalizedMission.localModel && normalizedMission.disableLocalModel !== true) {
    const workerTenant = normalizedMission.workspaceId
      ? await db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', normalizedMission.workspaceId)
      : null;
    const route = await localWorkerRoute(db, agentId, normalizedMission.role, normalizedMission.modelTier, workerTenant || {});
    normalizedMission.localModel = route.selectedModel;
    normalizedMission.localRoutingPolicy = route.policy;
    normalizedMission.localRoutingCriteria = route.criteria;
  }
  const runtimeEnvironment = bundledRuntimeEnvironment();
  console.log("adapter: provision"); const genosCapsule = await agentCapsules.provision({
    executable: runtimeEnvironment.GENOS_BIN,
    workspaceRoot: normalizedMission.workspaceRoot,
    capsuleRoot: normalizedMission.capsuleRoot,
    agentId,
    name: normalizedMission.name || dispatchedAgent.name || agentId,
    role: normalizedMission.role || dispatchedAgent.role || 'GenOS agent',
    budgetSteps: normalizedMission.executionBudget?.events || 100
  });
  emit(agentId, 'AGENT_CAPSULE_CREATED', 'CAPSULE', `Created GenOS capsule ${genosCapsule.id}.`, genosCapsule, 'info');
  if (dispatchedAgent.execution_mode === 'orchestrator') {
    emit(agentId, 'ORCHESTRATOR_WORKSPACE_CREATED', 'CAPSULE', `Created isolated workspace for orchestrator ${agentId}.`, {
      workspaceRoot: normalizedMission.workspaceRoot
    }, 'info');
  }
  // Monitoring is automatic for every mission created by the orchestrator.
  // The counter is mission-scoped, so a previously resolved incident cannot
  // terminate a new mission.
  await db.run('UPDATE agents SET hallucination_monitoring = 1, hallucination_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', agentId);
  emit(agentId, 'HALLUCINATION_MONITORING_ENABLED', 'MONITOR', 'Evidence-bound hallucination monitoring enabled for this mission.', {}, 'info');
  console.log("adapter: plan"); const autonomyPlan = await buildAutonomyPlanForMission({ db, agentId, normalizedMission, dispatchedAgent, contractRecord });
  assertNotCancelled();
  const silentUpdates = userProgress.silenceRequested(
    normalizedMission.prompt || normalizedMission.currentTask || '',
    normalizedMission.silentUpdates === true || normalizedMission.executionPolicy?.silentUpdates === true
  );
  normalizedMission.executionPolicy = {
    allowedCommands: Array.isArray(normalizedMission.executionPolicy?.allowedCommands)
      ? [...new Set(normalizedMission.executionPolicy.allowedCommands.map((value) => String(value).trim()).filter(Boolean))]
      : [],
    allowFileEdits: normalizedMission.executionPolicy?.allowFileEdits === true,
    silentUpdates
  };
  normalizedMission.userReporting = userProgress.reportingPolicy(normalizedMission.prompt || normalizedMission.currentTask || '', silentUpdates);
  if (dispatchedAgent.execution_mode === 'orchestrator' && !normalizedMission.toolLease?.length) {
    normalizedMission.toolLease = orchestratorToolLease(autonomyPlan || {});
  }
  const runtimeBudget = autonomyPlan
    ? {
      ...normalizedMission.executionBudget,
      tokens: Math.max(1, Math.floor(autonomyPlan.tokenPolicy.total * autonomyPlan.tokenPolicy.orchestratorReserve))
    }
    : normalizedMission.executionBudget;
  console.log("adapter: executionRun"); const executionRun = await strategyExecution.createExecutionRun(db, {
    agentId,
    budget: runtimeBudget,
    contractRecord
  });
  if (dispatchedAgent.execution_mode === 'orchestrator') {
    userProgress.report({
      orchestratorId: agentId,
      sourceAgentId: agentId,
      phase: 'started',
      message: `Mission started. The orchestrator selected '${contractRecord.primaryStrategy}' and is organizing the work.`,
      next: ['decompose the mission', 'collect worker evidence', 'verify the result'],
      silent: silentUpdates
    });
  }
  console.log("adapter: localModel"); assertNotCancelled(); if (normalizedMission.localModel) return runLocalWorker(db, normalizedMission, executionRun);

  // The orchestrator creates and dispatches its own bounded worker fleet. A worker
  // never recurses here: authority is deliberately one-way.
  let autonomousWorkers = [];
  if (dispatchedAgent.execution_mode === 'orchestrator' && normalizedMission.autonomousOrchestration !== false) {
    autonomousWorkers = await createAutonomousWorkers(db, dispatchedAgent, autonomyPlan, normalizedMission);
    if (autonomyPlan.aTeam?.activated && autonomousWorkers.length) {
      emit(agentId, 'A_TEAM_COMPOSED', 'COMPOSE_TEAM', `Composed an A-Team with ${autonomousWorkers.length} specialized members.`, {
        domains: autonomyPlan.aTeam.detectedDomains,
        members: autonomousWorkers.map((worker) => ({ workerId: worker.agentId, name: worker.name, role: worker.role }))
      }, 'info');
    }
    if (autonomyPlan.trinity?.activated && autonomousWorkers.length) {
      const trinityMissionId = `trinity_${agentId}_${Date.now()}`;
      for (const [index, worker] of autonomousWorkers.entries()) {
        const member = autonomyPlan.trinity.members[index];
        await db.run(
          `INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id)
           VALUES (?, ?, ?, ?, ?, 'running', ?)`,
          `${trinityMissionId}_world_${index + 1}`,
          normalizedMission.prompt || normalizedMission.currentTask || 'Trinity mission',
          index + 1, worker.name, member.role, worker.agentId
        );
      }
      emit(agentId, 'TRINITY_LAUNCHED', 'COMPOSE_TRINITY', 'Launched three isolated Trinity comparison worlds.', {
        missionId: trinityMissionId,
        worlds: autonomousWorkers.map((worker, index) => ({ workerId: worker.agentId, worldNumber: index + 1, strategy: autonomyPlan.trinity.members[index].role }))
      }, 'info');
    }
    for (const worker of autonomousWorkers) {
      emit(agentId, 'AUTONOMOUS_WORKER_CREATED', 'FORK', `Created autonomous worker '${worker.name}'.`, { workerId: worker.agentId, role: worker.role, tokenBudget: worker.executionBudget.tokens });
    }
    if (autonomousWorkers.length) {
      userProgress.report({
        orchestratorId: agentId,
        phase: 'working',
        message: `The orchestrator dispatched ${autonomousWorkers.length} worker${autonomousWorkers.length === 1 ? '' : 's'}: ${autonomousWorkers.map((worker) => worker.name).join(', ')}.`,
        next: autonomousWorkers.map((worker) => worker.prompt.split('\n')[1] || worker.role),
        silent: silentUpdates
      });
    }
    if (autonomousWorkers.length && autonomyPlan.tokenPolicy.rounds?.continuation?.survivorCount) autonomousRounds.set(agentId, { plan: autonomyPlan, workerIds: new Set(autonomousWorkers.map((worker) => worker.agentId)), workers: new Map(autonomousWorkers.map((worker) => [worker.agentId, worker])), results: new Map(), advanced: false });
  }
  if (autonomousWorkers.length) {
    await runEvidenceBarrier({ db, agentId, normalizedMission, autonomyPlan, contractRecord, autonomousWorkers });
  }

  assertNotCancelled();
  console.log("adapter: superviseMission"); return superviseMission({ db, agentId, normalizedMission, dispatchedAgent, contractRecord, executionRun, autonomyPlan, runtimeBudget, runtimeEnvironment, silentUpdates, genosCapsule, executable });
}
function startMission(mission) {
  const agentId = mission.agentId || mission.id;
  if (!agentId) return Promise.reject(new Error('agentId is required'));
  if (activeProcesses.has(agentId) || missionStarts.has(agentId)) return Promise.resolve({ started: true, duplicate: true });
  const start = startMissionInternal(mission).finally(async () => {
    missionStarts.delete(agentId);
    cancelledStarts.delete(agentId);
    emit(agentId, 'WORKER_RECOVERY_DECISION', 'RECOVERY_DISPATCH', `Checking for queued worker recovery after runtime shutdown for ${agentId}.`, {
      agentId,
      reason: 'runtime shutdown completed; review queued worker recovery if any'
    }, 'info');
    await dispatchWorkerRecovery(agentId);
    dispatchPendingContinuation(agentId);
  });
  missionStarts.set(agentId, start);
  return start;
}

function stopMission(agentId) {
  const child = activeProcesses.get(agentId);
  if (!child && missionStarts.has(agentId)) {
    cancelledStarts.add(agentId);
    return true;
  }
  if (!child) {
    const barrier = activeWorkerBarriers.get(agentId);
    if (barrier) {
      barrier.cancelled = true;
      for (const workerId of barrier.workerIds) stopMission(workerId);
      return true;
    }
  }
  if (!child) {
    getDatabase().then(async (db) => {
      const agent = await db.get('SELECT runtime_pid FROM agents WHERE id = ?', agentId);
      if (agent?.runtime_pid) {
        terminatePid(agent.runtime_pid);
        await db.run("UPDATE agents SET status = 'blocked', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", agentId);
      }
    }).catch(() => {});
    return false;
  }
  // The close handler recognizes this marker as an operator-requested halt,
  // rather than reporting SIGTERM as a runtime failure.
  child.genosStopRequested = true;
  terminateChild(child);
  return true;
}

function stopAllMissions() {
  return [...new Set([...activeProcesses.keys(), ...activeWorkerBarriers.keys()])].filter(stopMission);
}

async function reconcilePersistedRuntimes(db) {
  const rows = await db.all("SELECT id, runtime_pid, runtime_executable FROM agents WHERE status = 'running' AND runtime_pid IS NOT NULL");
  let reconciled = 0;
  for (const row of rows) {
    let alive = true;
    try { process.kill(Number(row.runtime_pid), 0); } catch (_) { alive = false; }
    const matches = alive && processMatches(row.runtime_pid, row.runtime_executable);
    if (alive && matches) terminatePid(row.runtime_pid);
    if (!alive || !matches) {
      await db.run("UPDATE agents SET status = 'error', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", alive ? 'Runtime PID was reused by another executable.' : 'Runtime disappeared before shutdown reconciliation', row.id);
      reconciled += 1;
    } else {
      await db.run("UPDATE agents SET status = 'blocked', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, current_task = 'Orphaned runtime terminated during startup reconciliation', updated_at = CURRENT_TIMESTAMP WHERE id = ?", row.id);
      reconciled += 1;
    }
  }
  return reconciled;
}

module.exports = {
  startMission,
  stopMission,
  stopAllMissions,
  reconcilePersistedRuntimes,
  configuredExecutable,
  bundledRuntimeEnvironment,
  runtimeAvailability,
  createIsolatedWorkspace,
  provisionMissionWorkspace,
  runtimeExitOutcome,
  evidenceScore: require('./agentEvidenceService').evidenceScore,
  workerToolLease: require('./agentOrchestrationState').workerToolLease,
  orchestratorToolLease: require('./agentOrchestrationState').orchestratorToolLease,
  rankLocalModels: require('./agentModelRoutingService').rankLocalModels,
  localCompetencyFloor: require('./agentModelRoutingService').localCompetencyFloor,
  competentLocalModels: require('./agentModelRoutingService').competentLocalModels,
  modelUsage: require('./agentModelRoutingService').modelUsage,
  autonomousRoundOutcome: require('./agentRoundService').autonomousRoundOutcome,
  buildWorkerSynthesisPrompt: require('./agentEvidenceService').buildWorkerSynthesisPrompt,
  waitForAutonomousWorkerQuiescence: require('./agentFleetService').waitForAutonomousWorkerQuiescence
};
