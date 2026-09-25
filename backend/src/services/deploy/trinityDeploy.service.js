const crypto = require('crypto');
const { getDatabase } = require('../../db');
const telemetry = require('../telemetryObserver');
const runtimeAdapter = require('../agentRuntimeAdapter');
const strategyContracts = require('../strategyContractService');
const workerGarage = require('../workerGarageService');
const AgentRepository = require('../../repositories/agent.repository');
const trinityService = require('../trinityService');
const workspaceLifecycle = require('../agentWorkspaceLifecycleService');
const { hashWorkspace } = require('../trinitySnapshotService');
const trinityExperimentStore = require('../trinityExperimentStore');
const { normalizeMissionBudget } = require('../budgetCoherenceService');

async function createIsolatedWorlds(worlds, sourceRoot) {
  if (!sourceRoot) throw Object.assign(new Error('Trinity requires a source workspace to seal its three worlds.'), { code: 'TRINITY_WORKSPACE_REQUIRED' });
  const prepared = [];
  try {
    for (const world of worlds) {
      const workspaceRoot = await workspaceLifecycle.createIsolatedWorkspace(sourceRoot, world.agentId);
      const isolatedWorld = { ...world, workspaceRoot, snapshotHash: null };
      prepared.push(isolatedWorld);
      isolatedWorld.snapshotHash = await hashWorkspace(workspaceRoot);
    }
    if (new Set(prepared.map((world) => world.snapshotHash)).size !== 1) {
      throw Object.assign(new Error('Trinity worlds do not share an identical workspace snapshot.'), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
    }
    return prepared;
  } catch (error) {
    await Promise.all(prepared.map((world) => workspaceLifecycle.cleanupWorkspace(world.workspaceRoot).catch(() => {})));
    throw error;
  }
}

class TrinityDeployService {
  constructor() {
    this.agentRepo = null;
  }

  async initRepo() {
    const db = await getDatabase();
    this.agentRepo = new AgentRepository(db);
    return db;
  }

  async deployTrinity(params) {
    const { 
      prompt, 
      resolvedAgentType, 
      workspaceId, 
      workspace,
      executionBudget,
      integrationChecks,
      claimVerificationChecks
    } = params;

    const db = await this.initRepo();
    const taskPrompt = prompt || 'Trinity mission';
    const budget = normalizeMissionBudget(executionBudget || {});
    const analysis = trinityService.analyzeMission(taskPrompt);
    const composed = trinityService.compose(taskPrompt);

    const worlds = composed.map((m) => ({
      name: `Trinity Worker (World ${m.worldNumber}: ${m.role})`,
      role: m.role,
      workerKind: m.workerKind,
      task: m.hypothesis,
      modelTier: m.modelTier === 'standard' ? 'Standard' : 'Pro',
      domain: m.domain,
      artifact: m.artifact,
      mission: m.mission,
      worldNumber: m.worldNumber
    }));

    const missionId = `trinity_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const orchestratorId = `agent_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const orchestratorName = `Trinity Orchestrator ${missionId.slice(-4)}`;
    const isolatedWorlds = await createIsolatedWorlds(worlds.map((world, index) => ({
      ...world,
      agentId: `agent_${Date.now()}_${index + 1}_${crypto.randomBytes(3).toString('hex')}`
    })), workspace?.path);
    const perChamberTokens = Math.floor((budget.tokens * budget.workerShare) / 3);
    if (perChamberTokens < 1) {
      await Promise.all(isolatedWorlds.map((world) => workspaceLifecycle.cleanupWorkspace(world.workspaceRoot).catch(() => {})));
      throw Object.assign(new Error('Trinity budget must allocate at least one token to each chamber.'), { code: 'TRINITY_BUDGET_TOO_SMALL' });
    }
    const budgetPolicy = {
      totalTokens: budget.tokens,
      perChamberTokens: [perChamberTokens, perChamberTokens, perChamberTokens],
      maxLatencyMs: budget.latencyMs,
      overflowBehavior: 'escalate'
    };
    try {
      await trinityExperimentStore.create(db, {
        id: missionId,
        missionId,
        domain: analysis.domain,
        snapshotHash: isolatedWorlds[0].snapshotHash,
        design: trinityService.designHypotheses(taskPrompt, { integrationChecks, claimVerificationChecks }),
        isolationPolicy: { sharedMemory: 'read-only-snapshot', communication: 'forbidden', provenanceTracking: 'full', randomSeedPerChamber: false },
        budgetPolicy
      });
    } catch (error) {
      await Promise.all(isolatedWorlds.map((world) => workspaceLifecycle.cleanupWorkspace(world.workspaceRoot).catch(() => {})));
      throw error;
    }
    
    await this.agentRepo.create({
      id: orchestratorId, 
      name: orchestratorName, 
      role: 'Trinity Orchestrator', 
      status: 'idle', 
      agent_type: resolvedAgentType, 
      execution_mode: 'orchestrator', 
      workspace_id: workspaceId, 
      model_tier: 'Pro', 
      isolation_mode: 'Branch', 
      fleet_id: missionId, 
      about: `Orchestrator for Trinity mission (${analysis.domain}): ${taskPrompt}`, 
      current_task: taskPrompt
    });

    const orchestratorContract = await strategyContracts.saveContract(db, {
      agentId: orchestratorId,
      workspaceId,
      problem: taskPrompt,
      domain: analysis.domain,
      artifact: analysis.artifact,
      createdBy: 'trinity_orchestrator'
    });
    
    const agentIds = isolatedWorlds.map((world) => world.agentId);
    const persistedWorlds = [];
    
    for (let index = 0; index < isolatedWorlds.length; index += 1) {
      const w = isolatedWorlds[index];
      const id = w.agentId;
      const worldId = `${missionId}_world_${index + 1}`;
      
      await this.agentRepo.create({
        id, 
        name: w.name, 
        role: w.role, 
        status: 'idle', 
        agent_type: resolvedAgentType, 
        execution_mode: 'worker', 
        workspace_id: workspaceId, 
        model_tier: w.modelTier, 
        isolation_mode: 'Branch', 
        fleet_id: missionId, 
        parent_agent_id: orchestratorId, 
        lineage_relation: 'orchestrator_dispatch', 
        about: `Trinity world ${w.worldNumber} (${w.domain}) for: ${taskPrompt}`, 
        current_task: w.mission || `${taskPrompt} — ${w.task}`
      });

      const workerKinds = require('../agents/workerKindService');
      const workerContract = workerKinds.buildWorkerContract(w.workerKind, {
        prompt: w.mission || `${taskPrompt} — ${w.task}`,
        scope: w.workspaceRoot,
        orchestratorAgentId: orchestratorId
      });
      await db.run('UPDATE agents SET metadata_json = ? WHERE id = ?',
        JSON.stringify({ workerKind: w.workerKind, workerContract }), id);

      await trinityExperimentStore.createWorld(db, {
        id: worldId, mission: taskPrompt, worldNumber: w.worldNumber, name: w.name,
        strategy: w.role, status: 'queued', agentId: id, experimentId: missionId,
        chamber: composed[index].chamber, snapshotHash: w.snapshotHash, workspaceRoot: w.workspaceRoot
      });
      persistedWorlds.push({
        id: worldId,
        mission: taskPrompt,
        worldNumber: w.worldNumber,
        name: w.name,
        chamber: composed[index].chamber,
        strategy: w.role,
        hypothesis: w.task,
        domain: w.domain,
        artifact: w.artifact,
        status: 'queued',
        agentId: id,
        fleetId: missionId,
        workspaceRoot: w.workspaceRoot,
        snapshotHash: w.snapshotHash
      });
      
      telemetry.emitEvent({
        eventType: 'TRINITY_WORLD_SPAWNED',
        agentId: id,
        action: 'FORK',
        detail: `Spawned ${w.name} [${w.domain}]`,
        severity: 'info',
        payload: { experimentId: missionId, worldNumber: w.worldNumber, snapshotHash: w.snapshotHash }
      });
    }

    // Each isolated world must actually run: reserve its garage slot and start
    // its mission. The orchestrator is started without its own autonomous fleet
    // so it does not fabricate a second, duplicate set of Trinity worlds.
    for (let index = 0; index < isolatedWorlds.length; index += 1) {
      const w = isolatedWorlds[index];
      const id = agentIds[index];
      await workerGarage.reserveSlot(db, {
        orchestratorId, workerId: id, name: w.name, role: w.role, mission: taskPrompt
      });
      runtimeAdapter.startMission({
        agentId: id, name: w.name, role: w.role, prompt: w.mission || `${taskPrompt} — ${w.task}`,
        workerKind: w.workerKind,
        modelTier: w.modelTier, workspaceIsolation: 'Branch', workspaceId, workspaceRoot: w.workspaceRoot,
        workspaceProvisioned: true,
        executionBudget: {
          tokens: perChamberTokens,
          costUsd: budget.costUsd * budget.workerShare / 3,
          latencyMs: budget.latencyMs,
          events: Math.max(1, Math.floor(budget.events / 3)),
          workerShare: 1,
          orchestratorReserve: 0
        },
        fleetId: missionId, agentType: resolvedAgentType, orchestratorAgentId: orchestratorId,
        strategyContract: orchestratorContract.contract, autonomousOrchestration: false,
        toolLease: runtimeAdapter.workerToolLease(w.role)
      }).catch(async (error) => {
        await db.run("UPDATE agents SET status='error', current_task=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", error.message, id).catch(() => {});
        await db.run("UPDATE trinity_worlds SET status='error', updated_at=CURRENT_TIMESTAMP WHERE agent_id=?", id).catch(() => {});
        telemetry.emitEvent({ eventType: 'AGENT_RUNTIME_ERROR', agentId: id, action: 'ERROR', detail: error.message, severity: 'error', status: 'error' });
      });
    }

    runtimeAdapter.startMission({
      agentId: orchestratorId, name: orchestratorName, role: 'Trinity Orchestrator', prompt: taskPrompt,
      modelTier: 'Pro', workspaceIsolation: 'Branch', workspaceId, workspaceRoot: workspace?.path, fleetId: missionId,
      executionBudget: {
        tokens: Math.max(1, Math.floor(budget.tokens * budget.orchestratorReserve)),
        costUsd: budget.costUsd * budget.orchestratorReserve,
        latencyMs: budget.latencyMs,
        events: Math.max(1, Math.floor(budget.events * budget.orchestratorReserve)),
        workerShare: 0,
        orchestratorReserve: 1
      },
      agentType: resolvedAgentType, strategyContract: orchestratorContract.contract,
      autonomousOrchestration: false
    }).catch(async (error) => {
      await db.run("UPDATE agents SET status='error', current_task=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", error.message, orchestratorId).catch(() => {});
      for (const id of agentIds) {
        await db.run("UPDATE agents SET status='error', current_task='Orchestrator launch failed', updated_at=CURRENT_TIMESTAMP WHERE id=?", id).catch(() => {});
        await db.run("UPDATE trinity_worlds SET status='error', updated_at=CURRENT_TIMESTAMP WHERE agent_id=?", id).catch(() => {});
      }
      telemetry.emitEvent({ eventType: 'AGENT_RUNTIME_ERROR', agentId: orchestratorId, action: 'ERROR', detail: error.message, severity: 'error', status: 'error' });
    });

    return {
      missionId,
      domain: analysis.domain,
      artifact: analysis.artifact,
      orchestratorId,
      orchestratorName,
      orchestratorContract,
      persistedWorlds,
      agentIds
    };
  }
}

module.exports = new TrinityDeployService();
