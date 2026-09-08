const { getDatabase } = require('../../db');
const telemetry = require('../telemetryObserver');
const runtimeAdapter = require('../agentRuntimeAdapter');
const workerGarage = require('../workerGarageService');
const strategyContracts = require('../strategyContractService');
const agentAuthority = require('../agentAuthorityService');
const agentIdentity = require('../agentIdentityService');
const agentConscience = require('../agentConscienceService');
const AgentRepository = require('../../repositories/agent.repository');

class AgentDeployService {
  constructor() {
    this.agentRepo = null; // Instantiated during deploy
  }

  async initRepo() {
    const db = await getDatabase();
    this.agentRepo = new AgentRepository(db);
    return db;
  }

  async deployAgent(params) {
    const { 
      prompt, 
      modelTier = 'Flash', 
      workspaceIsolation = 'Branch', 
      role = 'Autonomous Node', 
      name, 
      about, 
      resolvedAgentType,
      language = 'TypeScript', 
      workspaceId = null, 
      fleetId = null, 
      parentAgentId = null, 
      lineageRelation = 'independent', 
      executionBudget,
      executionMode,
      workspace,
      runtime,
      executor
    } = params;

    const db = await this.initRepo();
    
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const identity = agentIdentity.generateAgentIdentity({ preferredName: name, role });
    const agentName = identity.name;
    const nameMeaning = identity.name_meaning;
    const initialConscience = agentConscience.createConscienceState();

    let inheritedStrategyContract = null;
    if (executionMode === 'worker') {
      await agentAuthority.requireOrchestrator(db, parentAgentId);
      inheritedStrategyContract = await strategyContracts.getLatestContract(db, parentAgentId);
      if (!inheritedStrategyContract) {
        inheritedStrategyContract = await strategyContracts.saveContract(db, {
          agentId: parentAgentId,
          workspaceId,
          problem: prompt || `Worker orchestration for ${role}`,
          createdBy: 'worker_deployment'
        });
      }
    }

    await this.agentRepo.create({
      id: agentId, 
      name: agentName,
      name_meaning: nameMeaning,
      role, 
      status: 'idle', 
      agent_type: resolvedAgentType || 'GenOS', 
      execution_mode: executionMode, 
      workspace_id: workspaceId, 
      fleet_id: fleetId, 
      model_tier: modelTier, 
      language, 
      isolation_mode: workspaceIsolation, 
      parent_agent_id: parentAgentId, 
      lineage_relation: lineageRelation, 
      about: about || prompt || identity.introduction, 
      current_task: prompt || 'Autonomous task execution',
      dissonance_level: initialConscience.dissonanceLevel,
      eureka_count: initialConscience.eurekaMoments,
      cognitive_budget: initialConscience.currentBudget,
      cognitive_baseline_budget: initialConscience.baselineBudget,
      cognitive_max_dissonance: initialConscience.maxDissonanceThreshold,
      is_apoptotic: initialConscience.isApoptotic ? 1 : 0
    });

    if (executionMode === 'orchestrator') {
      await db.run(
        'INSERT OR REPLACE INTO agent_permissions (agent_id, permissions_json, denied_tools_json, taint_policy) VALUES (?, ?, ?, ?)',
        agentId, JSON.stringify(['tool:execute']), JSON.stringify([]), 'block_external'
      );
    }
    
    const strategyContract = executionMode === 'orchestrator'
      ? await strategyContracts.saveContract(db, {
        agentId,
        workspaceId,
        problem: prompt || `Autonomous task execution for ${role}`,
        createdBy: 'deployment_orchestrator'
      })
      : inheritedStrategyContract;

    telemetry.emitEvent({
      eventType: 'AGENT_QUEUED',
      agentId,
      action: 'DEPLOY',
      detail: `Spawned agent '${agentName}' with tier ${modelTier}`,
      severity: 'info',
      payload: {
        prompt, agentType: resolvedAgentType, modelTier, workspaceIsolation,
        executionMode,
        parentAgentId,
        strategyContractId: strategyContract?.id,
        primaryStrategy: strategyContract?.primaryStrategy
      }
    });

    if (executionMode === 'orchestrator') {
      runtimeAdapter.startMission({
        agentId, name: agentName, nameMeaning, introduction: identity.introduction, role, prompt: prompt || '', modelTier,
        workspaceIsolation, workspaceId, fleetId, agentType: resolvedAgentType,
        workspaceRoot: workspace?.path,
        strategyContract: strategyContract.contract,
        executionBudget,
        runtime,
        executor
      }).catch(async (error) => {
        await db.run("UPDATE agents SET status='error', current_task=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", error.message, agentId).catch(() => {});
        telemetry.emitEvent({ eventType: 'AGENT_RUNTIME_ERROR', agentId, action: 'ERROR', detail: error.message, severity: 'error', status: 'error' });
      });
    } else {
      telemetry.emitEvent({
        eventType: 'AGENT_AWAITING_ORCHESTRATOR', agentId, action: 'AWAIT_DISPATCH',
        detail: `Worker '${agentName}' is idle until orchestrator '${parentAgentId}' dispatches it.`, severity: 'info'
      });
    }

    return {
      agentId,
      agentName,
      strategyContract
    };
  }
}

module.exports = new AgentDeployService();
