const { createAutonomousWorkers } = require('../agentFleetService');
const { emit, autonomousRounds } = require('../agentOrchestrationState');
const userProgress = require('../userProgressService');
const { withTransaction } = require('../../db');
const trinityExperimentStore = require('../trinityExperimentStore');
const { hashWorkspace } = require('../trinitySnapshotService');
const trinityService = require('../trinityService');

function emitTeamComposition(ctx, autonomousWorkers) {
  const { agentId, autonomyPlan } = ctx;
  if (autonomyPlan.aTeam?.activated && autonomousWorkers.length) {
    emit(agentId, 'A_TEAM_COMPOSED', 'COMPOSE_TEAM', `Composed an A-Team with ${autonomousWorkers.length} specialized members.`, {
      domains: autonomyPlan.aTeam.detectedDomains,
      members: autonomousWorkers.map((worker) => ({ workerId: worker.agentId, name: worker.name, role: worker.role }))
    }, 'info');
  }
}

function assertTrinitySnapshot(autonomousWorkers, snapshotHashes) {
  if (autonomousWorkers.length !== 3) throw Object.assign(new Error('Trinity requires exactly three isolated worlds.'), { code: 'TRINITY_WORLD_COUNT_INVALID' });
  if (new Set(snapshotHashes).size !== 1) throw Object.assign(new Error('Trinity worlds do not share an identical workspace snapshot.'), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
}

function trinityBudgetPolicy(autonomyPlan, normalizedMission) {
  const initialRound = autonomyPlan.tokenPolicy.rounds?.initial || {};
  const perChamberTokens = Array.isArray(initialRound.workerTokens)
    ? initialRound.workerTokens
    : Array(3).fill(initialRound.perWorkerTokens || 0);
  return {
    totalTokens: autonomyPlan.tokenPolicy.total,
    perChamberTokens,
    maxLatencyMs: normalizedMission.executionBudget?.latencyMs || null,
    overflowBehavior: 'escalate'
  };
}

async function persistTrinityExperiment(db, input) {
  const { trinityMissionId, snapshotHashes, autonomyPlan, normalizedMission, autonomousWorkers, budgetPolicy } = input;
  await withTransaction(db, async (tx) => {
    await trinityExperimentStore.create(tx, {
      id: trinityMissionId,
      missionId: trinityMissionId,
      domain: autonomyPlan.trinity.domain,
      snapshotHash: snapshotHashes[0],
      design: trinityService.designHypotheses(normalizedMission.prompt || normalizedMission.currentTask || '', {
        integrationChecks: normalizedMission.trinityIntegrationChecks,
        claimVerificationChecks: normalizedMission.trinityClaimVerificationChecks
      }),
      isolationPolicy: { sharedMemory: 'read-only-snapshot', communication: 'forbidden', provenanceTracking: 'full', randomSeedPerChamber: false },
      budgetPolicy
    });
    for (const [index, worker] of autonomousWorkers.entries()) {
      const member = autonomyPlan.trinity.members[index];
      await trinityExperimentStore.createWorld(tx, {
        id: `${trinityMissionId}_world_${index + 1}`,
        experimentId: trinityMissionId,
        mission: normalizedMission.prompt || normalizedMission.currentTask || 'Trinity mission',
        worldNumber: index + 1, name: worker.name, strategy: member.role, chamber: member.chamber,
        status: 'running', agentId: worker.agentId, snapshotHash: snapshotHashes[index], workspaceRoot: worker.workspaceRoot
      });
    }
  });
}

async function launchTrinityWorlds(ctx, autonomousWorkers) {
  const { db, agentId, normalizedMission, autonomyPlan } = ctx;
  if (!(autonomyPlan.trinity?.activated && autonomousWorkers.length)) return;
  const snapshotHashes = await Promise.all(autonomousWorkers.map((worker) => hashWorkspace(worker.workspaceRoot)));
  assertTrinitySnapshot(autonomousWorkers, snapshotHashes);
  const trinityMissionId = `trinity_${agentId}_${Date.now()}`;
  autonomyPlan.trinity.missionId = trinityMissionId;
  autonomyPlan.trinity.experimentId = trinityMissionId;
  await persistTrinityExperiment(db, {
    trinityMissionId, snapshotHashes, autonomyPlan, normalizedMission, autonomousWorkers,
    budgetPolicy: trinityBudgetPolicy(autonomyPlan, normalizedMission)
  });
  emit(agentId, 'TRINITY_LAUNCHED', 'COMPOSE_TRINITY', 'Launched three isolated Trinity comparison worlds.', {
    missionId: trinityMissionId,
    worlds: autonomousWorkers.map((worker, index) => ({ workerId: worker.agentId, worldNumber: index + 1, strategy: autonomyPlan.trinity.members[index].role }))
  }, 'info');
}

function emitWorkerCreations(agentId, autonomousWorkers) {
  for (const worker of autonomousWorkers) {
    emit(agentId, 'AUTONOMOUS_WORKER_CREATED', 'FORK', `Created autonomous worker '${worker.name}'.`, { workerId: worker.agentId, role: worker.role, tokenBudget: worker.executionBudget.tokens });
  }
}

function reportWorkerDispatch(ctx, autonomousWorkers) {
  if (autonomousWorkers.length) {
    userProgress.report({
      orchestratorId: ctx.agentId,
      phase: 'working',
      message: `The orchestrator dispatched ${autonomousWorkers.length} worker${autonomousWorkers.length === 1 ? '' : 's'}: ${autonomousWorkers.map((worker) => worker.name).join(', ')}.`,
      next: autonomousWorkers.map((worker) => worker.prompt.split('\n')[1] || worker.role),
      silent: ctx.silentUpdates
    });
  }
}

function registerAutonomousRound(ctx, autonomousWorkers) {
  const { agentId, autonomyPlan } = ctx;
  const survivorCount = autonomyPlan.tokenPolicy.rounds?.continuation?.survivorCount;
  if (autonomousWorkers.length && Number.isInteger(survivorCount) && survivorCount > 0) {
    autonomousRounds.set(agentId, {
      plan: autonomyPlan,
      workerIds: new Set(autonomousWorkers.map((worker) => worker.agentId)),
      workers: new Map(autonomousWorkers.map((worker) => [worker.agentId, worker])),
      results: new Map(),
      advanced: false
    });
  }
}

async function orchestrateAutonomousWorkers(ctx) {
  if (ctx.dispatchedAgent.execution_mode !== 'orchestrator') return [];
  const assignments = Array.isArray(ctx.autonomyPlan?.dispatchWorkers) ? ctx.autonomyPlan.dispatchWorkers : [];
  if (ctx.normalizedMission.autonomousOrchestration === false) {
    emitDispatchDeferred(ctx, assignments);
    return [];
  }
  const autonomousWorkers = await dispatchSelectedWorkers(ctx, assignments);
  emitDispatchReconciled(ctx, assignments, autonomousWorkers);
  await activateCreatedWorkers(ctx, autonomousWorkers);
  return autonomousWorkers;
}

function emitDispatchSelected(ctx, assignments) {
  if (!assignments.length) return;
  emit(ctx.agentId, 'WORKER_DISPATCH_SELECTED', 'DISPATCH_WORKERS', `Selected ${assignments.length} worker assignment(s) for dispatch.`, {
    requestedWorkers: ctx.autonomyPlan.workers?.length || assignments.length,
    selectedWorkers: assignments.length,
    assignments: assignments.map((assignment) => ({ label: assignment.label, role: assignment.role }))
  }, 'info');
}

async function dispatchSelectedWorkers(ctx, assignments) {
  emitDispatchSelected(ctx, assignments);
  let autonomousWorkers = [];
  try {
    autonomousWorkers = await createAutonomousWorkers(ctx.db, ctx.dispatchedAgent, ctx.autonomyPlan, ctx.normalizedMission);
    assertWorkerDispatchMatches(assignments, autonomousWorkers);
  } catch (error) {
    autonomousWorkers = Array.isArray(error.createdWorkers) ? error.createdWorkers : autonomousWorkers;
    await cleanupUnlaunchedWorkers(ctx, autonomousWorkers, error);
    emitDispatchFailed(ctx, assignments, { workers: autonomousWorkers, error: error });
    throw error;
  }
  return autonomousWorkers;
}

async function cleanupUnlaunchedWorkers(ctx, workers, error) {
  const cleanup = require('../agentWorkspaceLifecycleService').scheduleWorkspaceCleanup;
  await Promise.allSettled(workers.map(async (worker) => {
    await ctx.db.run(
      "UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      `Dispatch failed: ${error.code || 'worker_creation_error'}`,
      worker.agentId
    );
    await cleanup(worker.agentId);
  }));
}

function emitDispatchFailed(ctx, assignments, outcome) {
  const { workers, error } = outcome;
  emit(ctx.agentId, 'WORKER_DISPATCH_FAILED', 'DISPATCH_WORKERS', `Worker dispatch failed: ${error.message}`, {
      requestedWorkers: ctx.autonomyPlan.workers?.length || assignments.length,
      selectedWorkers: assignments.length,
      createdWorkers: workers.length,
      errorCode: error.code || 'WORKER_DISPATCH_FAILED'
  }, 'error');
}

function emitDispatchReconciled(ctx, assignments, workers) {
  if (assignments.length) {
    emit(ctx.agentId, 'WORKER_DISPATCH_RECONCILED', 'DISPATCH_WORKERS', `Created all ${workers.length} selected worker(s).`, {
      requestedWorkers: ctx.autonomyPlan.workers?.length || assignments.length,
      selectedWorkers: assignments.length,
      createdWorkers: workers.length,
      workerIds: workers.map((worker) => worker.agentId),
      status: 'created'
    }, 'info');
  }
}

async function activateCreatedWorkers(ctx, workers) {
  if (!workers.length) return;
  emitTeamComposition(ctx, workers);
  await launchTrinityWorlds(ctx, workers);
  emitWorkerCreations(ctx.agentId, workers);
  reportWorkerDispatch(ctx, workers);
  registerAutonomousRound(ctx, workers);
}

function assertWorkerDispatchMatches(assignments, workers) {
  if (workers.length !== assignments.length) {
    throw Object.assign(new Error(`Worker dispatch count mismatch: selected ${assignments.length}, created ${workers.length}.`), {
      code: 'WORKER_DISPATCH_COUNT_MISMATCH',
      selectedWorkers: assignments.length,
      createdWorkers: workers.length
    });
  }
  const assignmentMismatch = assignments.some((assignment, index) => {
    const worker = workers[index];
    return !worker?.agentId
      || (assignment.label && assignment.label !== worker.label)
      || (assignment.role && assignment.role !== worker.role);
  });
  const duplicateIds = new Set(workers.map((worker) => worker.agentId)).size !== workers.length;
  if (!assignmentMismatch && !duplicateIds) return;
  throw Object.assign(new Error('Created workers do not match the selected assignment identities.'), {
    code: 'WORKER_DISPATCH_ASSIGNMENT_MISMATCH',
    selectedWorkers: assignments.length,
    createdWorkers: workers.length
  });
}

function emitDispatchDeferred(ctx, assignments) {
  if (!assignments.length) return;
  emit(ctx.agentId, 'WORKER_DISPATCH_DEFERRED', 'DISPATCH_WORKERS', 'Selected worker assignments were not dispatched because autonomous orchestration is disabled by mission policy.', {
    requestedWorkers: ctx.autonomyPlan.workers?.length || assignments.length,
    selectedWorkers: assignments.length,
    createdWorkers: 0,
    reason: 'autonomous_orchestration_disabled',
    policy: ctx.normalizedMission.executionPolicy || {}
  }, 'warning');
}

module.exports = { orchestrateAutonomousWorkers, assertWorkerDispatchMatches };
