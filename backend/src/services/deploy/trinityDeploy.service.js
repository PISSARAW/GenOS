const { getDatabase } = require('../../db');
const telemetry = require('../telemetryObserver');
const runtimeAdapter = require('../agentRuntimeAdapter');
const strategyContracts = require('../strategyContractService');
const AgentRepository = require('../../repositories/agent.repository');

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
      workspace 
    } = params;

    const db = await this.initRepo();

    const worlds = [
      { name: 'Trinity Worker (World 1: Basic)', role: 'Basic Implementation', task: 'Implement raw need' },
      { name: 'Trinity Worker (World 2: Planned)', role: 'Planned Implementation', task: 'Implement according to interview plan' },
      { name: 'Trinity Worker (World 3: AI-Corrected)', role: 'AI-Corrected Implementation', task: 'Implement with AI self-correction' }
    ];

    const missionId = `trinity_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const orchestratorId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const orchestratorName = `Trinity Orchestrator ${missionId.slice(-4)}`;
    
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
      about: `Orchestrator for Trinity mission: ${prompt || 'Autonomous task execution'}`, 
      current_task: prompt || 'Trinity mission'
    });

    const orchestratorContract = await strategyContracts.saveContract(db, {
      agentId: orchestratorId,
      workspaceId,
      problem: prompt || 'Trinity mission',
      createdBy: 'trinity_orchestrator'
    });
    
    const agentIds = [];
    const persistedWorlds = [];
    
    for (let index = 0; index < worlds.length; index += 1) {
      const w = worlds[index];
      const id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      agentIds.push(id);
      const worldId = `${missionId}_world_${index + 1}`;
      
      await this.agentRepo.create({
        id, 
        name: w.name, 
        role: w.role, 
        status: 'idle', 
        agent_type: resolvedAgentType, 
        execution_mode: 'worker', 
        workspace_id: workspaceId, 
        model_tier: 'Pro', 
        isolation_mode: 'Branch', 
        fleet_id: missionId, 
        parent_agent_id: orchestratorId, 
        lineage_relation: 'orchestrator_dispatch', 
        about: `Trinity world ${index + 1} for: ${prompt}`, 
        current_task: `${prompt || 'Trinity mission'} — ${w.task}`
      });

      await db.run(`INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, worldId, prompt || 'Trinity mission', index + 1, w.name, w.role, 'queued', id);
      persistedWorlds.push({ id: worldId, mission: prompt, worldNumber: index + 1, name: w.name, strategy: w.role, status: 'queued', agentId: id, fleetId: missionId });
      
      telemetry.emitEvent({
        eventType: 'TRINITY_WORLD_SPAWNED',
        agentId: id,
        action: 'FORK',
        detail: `Spawned ${w.name}`,
        severity: 'info'
      });
    }

    runtimeAdapter.startMission({
      agentId: orchestratorId, name: orchestratorName, role: 'Trinity Orchestrator', prompt: prompt || 'Trinity mission',
      modelTier: 'Pro', workspaceIsolation: 'Branch', workspaceId, workspaceRoot: workspace?.path, fleetId: missionId,
      agentType: resolvedAgentType, strategyContract: orchestratorContract.contract
    }).catch(async (error) => {
      await db.run("UPDATE agents SET status='error', current_task=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", error.message, orchestratorId).catch(() => {});
      telemetry.emitEvent({ eventType: 'AGENT_RUNTIME_ERROR', agentId: orchestratorId, action: 'ERROR', detail: error.message, severity: 'error', status: 'error' });
    });

    return {
      missionId,
      orchestratorId,
      orchestratorName,
      orchestratorContract,
      persistedWorlds,
      agentIds
    };
  }
}

module.exports = new TrinityDeployService();
