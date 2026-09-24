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
      design: trinityService.designHypotheses(normalizedMission.prompt || normalizedMission.currentTask || ''),
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
  const { db, dispatchedAgent, autonomyPlan, normalizedMission } = ctx;
  let autonomousWorkers = [];
  if (dispatchedAgent.execution_mode === 'orchestrator' && normalizedMission.autonomousOrchestration !== false) {
    autonomousWorkers = await createAutonomousWorkers(db, dispatchedAgent, autonomyPlan, normalizedMission);
    emitTeamComposition(ctx, autonomousWorkers);
    await launchTrinityWorlds(ctx, autonomousWorkers);
    emitWorkerCreations(ctx.agentId, autonomousWorkers);
    reportWorkerDispatch(ctx, autonomousWorkers);
    registerAutonomousRound(ctx, autonomousWorkers);
  }
  return autonomousWorkers;
}

module.exports = { orchestrateAutonomousWorkers };
